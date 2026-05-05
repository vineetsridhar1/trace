import { EventEmitter } from "events";
import { PassThrough } from "stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChildProcess } from "child_process";
import { CodexAdapter } from "../src/adapters/codex.js";
import type { ToolOutput, ToolOutputDelta } from "../src/adapters/coding-tool.js";

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(),
}));

vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("child_process")>();
  return {
    ...actual,
    spawn: mocks.spawn,
  };
});

interface JsonMessage {
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
}

class MockChildProcess extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  stdin = new PassThrough();
  pid = 987_654;
  kill = vi.fn();
  stdinChunks: string[] = [];

  constructor() {
    super();
    this.stdin.on("data", (chunk: Buffer) => {
      this.stdinChunks.push(chunk.toString("utf8"));
    });
  }

  writeStdout(message: JsonMessage): void {
    this.stdout.write(`${JSON.stringify(message)}\n`);
  }

  requests(): JsonMessage[] {
    return this.stdinChunks
      .join("")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as JsonMessage);
  }
}

function asChildProcess(child: MockChildProcess): ChildProcess {
  return child as unknown as ChildProcess;
}

async function flushReadline(): Promise<void> {
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
}

describe("CodexAdapter app-server protocol", () => {
  beforeEach(() => {
    mocks.spawn.mockReset();
  });

  it("emits assistant text deltas from app-server notifications", async () => {
    const child = new MockChildProcess();
    mocks.spawn.mockReturnValue(asChildProcess(child));
    const outputs: ToolOutput[] = [];
    const deltas: ToolOutputDelta[] = [];

    const adapter = new CodexAdapter();
    adapter.run({
      prompt: "hello",
      cwd: "/tmp/project",
      onOutput: (output) => outputs.push(output),
      onOutputDelta: (delta) => deltas.push(delta),
      onComplete: vi.fn(),
    });

    expect(mocks.spawn).toHaveBeenCalledWith(
      "codex",
      ["app-server", "--listen", "stdio://"],
      expect.objectContaining({ cwd: "/tmp/project" }),
    );
    expect(child.requests()[0]).toMatchObject({ id: 1, method: "initialize" });

    child.writeStdout({ id: 1, result: { userAgent: "trace/test" } });
    await flushReadline();
    child.writeStdout({ id: 2, result: { thread: { id: "thread-1" } } });
    await flushReadline();
    child.writeStdout({ id: 3, result: {} });
    await flushReadline();
    child.writeStdout({
      method: "item/agentMessage/delta",
      params: { threadId: "thread-1", turnId: "turn-1", itemId: "item-1", delta: "hi" },
    });
    await flushReadline();

    expect(child.requests()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 2, method: "thread/start" }),
        expect.objectContaining({ id: 3, method: "turn/start" }),
      ]),
    );
    expect(outputs).toEqual([]);
    expect(deltas).toEqual([{ type: "assistant_text_delta", text: "hi" }]);
  });

  it("surfaces app-server error notifications and completes the run", async () => {
    const child = new MockChildProcess();
    mocks.spawn.mockReturnValue(asChildProcess(child));
    const outputs: ToolOutput[] = [];
    const onComplete = vi.fn();

    const adapter = new CodexAdapter();
    adapter.run({
      prompt: "hello",
      cwd: "/tmp/project",
      onOutput: (output) => outputs.push(output),
      onComplete,
    });

    child.writeStdout({ id: 1, result: { userAgent: "trace/test" } });
    await flushReadline();
    child.writeStdout({ id: 2, result: { thread: { id: "thread-1" } } });
    await flushReadline();
    child.writeStdout({ id: 3, result: {} });
    await flushReadline();
    child.writeStdout({
      method: "error",
      params: {
        error: { message: "usage limit reached", codexErrorInfo: null, additionalDetails: null },
        willRetry: false,
        threadId: "thread-1",
        turnId: "turn-1",
      },
    });
    await flushReadline();

    expect(outputs).toEqual([
      { type: "error", message: "usage limit reached" },
      { type: "result", subtype: "error" },
    ]);
    expect(onComplete).toHaveBeenCalledOnce();
  });
});
