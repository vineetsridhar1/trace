import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { spawn } from "node:child_process";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CodexAdapter } from "../src/adapters/codex.js";

class FakeChildProcess extends EventEmitter {
  stdin = new PassThrough();
  stdout = new PassThrough();
  stderr = new PassThrough();
  pid = 12345;
  kill = vi.fn();
  writes: Array<Record<string, unknown>> = [];

  constructor() {
    super();
    let pending = "";
    this.stdin.on("data", (chunk: Buffer) => {
      pending += chunk.toString();
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) {
        if (line) this.writes.push(JSON.parse(line) as Record<string, unknown>);
      }
    });
  }

  send(message: Record<string, unknown>) {
    this.stdout.write(`${JSON.stringify(message)}\n`);
  }
}

const spawnedChildren: FakeChildProcess[] = [];

vi.mock("node:child_process", () => ({
  spawn: vi.fn(() => {
    const child = new FakeChildProcess();
    spawnedChildren.push(child);
    return child;
  }),
}));

async function waitForRequest(child: FakeChildProcess, method: string) {
  await vi.waitFor(() => {
    expect(child.writes.some((message) => message.method === method)).toBe(true);
  });
  return child.writes.find((message) => message.method === method)!;
}

describe("CodexAdapter app-server transport", () => {
  beforeEach(() => {
    spawnedChildren.length = 0;
    vi.mocked(spawn).mockClear();
  });

  it("starts an app-server thread and normalizes nested subagent activity", async () => {
    const adapter = new CodexAdapter();
    const onOutput = vi.fn();
    const onComplete = vi.fn();

    adapter.run({
      prompt: "- inspect the repository",
      cwd: "/tmp/workspace",
      model: "gpt-5.6-sol",
      reasoningEffort: "high",
      onOutput,
      onComplete,
    });

    expect(spawn).toHaveBeenCalledWith(
      "codex",
      ["app-server", "--listen", "stdio://"],
      expect.objectContaining({ cwd: "/tmp/workspace", stdio: ["pipe", "pipe", "pipe"] }),
    );

    const child = spawnedChildren[0];
    const initialize = await waitForRequest(child, "initialize");
    child.send({ id: initialize.id, result: { codexHome: "/tmp/.codex" } });

    const startThread = await waitForRequest(child, "thread/start");
    expect(startThread.params).toMatchObject({
      cwd: "/tmp/workspace",
      model: "gpt-5.6-sol",
      approvalPolicy: "never",
      sandbox: "danger-full-access",
      config: { model_reasoning_effort: "high" },
    });
    child.send({ id: startThread.id, result: { thread: { id: "root-thread" } } });

    const startTurn = await waitForRequest(child, "turn/start");
    expect(startTurn.params).toMatchObject({
      threadId: "root-thread",
      input: [{ type: "text", text: "- inspect the repository", text_elements: [] }],
      effort: "high",
    });
    child.send({ id: startTurn.id, result: { turn: { id: "root-turn" } } });

    child.send({
      method: "thread/started",
      params: {
        thread: {
          id: "child-thread",
          parentThreadId: "root-thread",
          preview: "Inspect the data layer",
          agentNickname: "Scout",
          agentRole: "explorer",
        },
      },
    });
    child.send({
      method: "item/started",
      params: {
        threadId: "child-thread",
        turnId: "child-turn",
        item: { type: "commandExecution", id: "command-1", command: "rg session" },
      },
    });
    child.send({
      method: "item/completed",
      params: {
        threadId: "child-thread",
        turnId: "child-turn",
        item: {
          type: "commandExecution",
          id: "command-1",
          command: "rg session",
          aggregatedOutput: "apps/server/src/services/session.ts",
          exitCode: 0,
          status: "completed",
        },
      },
    });
    child.send({
      method: "item/completed",
      params: {
        threadId: "child-thread",
        turnId: "child-turn",
        item: { type: "agentMessage", id: "message-1", text: "Found the service." },
      },
    });
    child.send({
      method: "turn/completed",
      params: {
        threadId: "child-thread",
        turn: { id: "child-turn", status: "completed", error: null },
      },
    });
    child.send({
      method: "thread/tokenUsage/updated",
      params: {
        threadId: "root-thread",
        turnId: "root-turn",
        tokenUsage: {
          last: {
            inputTokens: 100,
            cachedInputTokens: 40,
            cacheWriteInputTokens: 5,
            outputTokens: 20,
          },
        },
      },
    });
    child.send({
      method: "turn/completed",
      params: {
        threadId: "root-thread",
        turn: { id: "root-turn", status: "completed", error: null },
      },
    });

    await vi.waitFor(() => expect(onComplete).toHaveBeenCalledOnce());

    expect(adapter.getSessionId()).toBe("root-thread");
    expect(onOutput).toHaveBeenCalledWith({
      type: "assistant",
      message: {
        content: [
          expect.objectContaining({
            type: "tool_use",
            id: "codex-subagent:child-thread",
            name: "agent",
            input: expect.objectContaining({
              description: "Inspect the data layer",
              subagent_type: "explorer",
            }),
          }),
        ],
      },
    });
    expect(onOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "assistant",
        parentToolUseId: "codex-subagent:child-thread",
        message: {
          content: [expect.objectContaining({ type: "tool_use", id: "command-1" })],
        },
      }),
    );
    expect(onOutput).toHaveBeenCalledWith({
      type: "usage",
      usage: {
        inputTokens: 60,
        outputTokens: 20,
        cacheReadTokens: 40,
        cacheCreationTokens: 5,
      },
    });
    expect(onOutput).toHaveBeenCalledWith({ type: "result", subtype: "success" });
  });

  it("resumes an existing root thread", async () => {
    const adapter = new CodexAdapter();
    adapter.run({
      prompt: "continue",
      cwd: "/tmp/workspace",
      toolSessionId: "existing-thread",
      onOutput: vi.fn(),
      onComplete: vi.fn(),
    });

    const child = spawnedChildren[0];
    const initialize = await waitForRequest(child, "initialize");
    child.send({ id: initialize.id, result: {} });
    const resume = await waitForRequest(child, "thread/resume");
    expect(resume.params).toMatchObject({ threadId: "existing-thread" });
    expect(child.writes.some((message) => message.method === "thread/start")).toBe(false);
  });

  it("reports an app-server process failure while a turn is active", async () => {
    const onOutput = vi.fn();
    const onComplete = vi.fn();
    new CodexAdapter().run({
      prompt: "run",
      cwd: "/tmp/workspace",
      onOutput,
      onComplete,
    });

    const child = spawnedChildren[0];
    child.stderr.write("protocol failed\n");
    child.emit("close", 2);

    await vi.waitFor(() => expect(onComplete).toHaveBeenCalledOnce());
    expect(onOutput).toHaveBeenCalledWith({
      type: "error",
      message: "Codex app-server exited with code 2: protocol failed",
    });
    expect(onOutput).toHaveBeenCalledWith({ type: "result", subtype: "error" });
  });

  it("surfaces blocking native input requests through Trace questions", async () => {
    const onOutput = vi.fn();
    new CodexAdapter().run({
      prompt: "ask",
      cwd: "/tmp/workspace",
      onOutput,
      onComplete: vi.fn(),
    });

    const child = spawnedChildren[0];
    child.send({
      id: "input-request",
      method: "item/tool/requestUserInput",
      params: {
        threadId: "root-thread",
        turnId: "root-turn",
        itemId: "question-tool",
        isBlocking: true,
        questions: [
          {
            id: "scope",
            header: "Scope",
            question: "Which scope should be used?",
            isOther: true,
            options: [{ label: "Focused", description: "Only the affected package." }],
          },
        ],
      },
    });

    await vi.waitFor(() => {
      expect(onOutput).toHaveBeenCalledWith({
        type: "assistant",
        message: {
          content: [
            {
              type: "question",
              toolUseId: "question-tool",
              questions: [
                expect.objectContaining({
                  id: "scope",
                  type: "select-with-other",
                  protocol: "native",
                  question: "Which scope should be used?",
                }),
              ],
            },
          ],
        },
      });
    });
    expect(child.writes.some((message) => message.id === "input-request")).toBe(false);
  });
});
