import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { spawn } from "child_process";
import { ClaudeCodeAdapter } from "../src/adapters/claude-code.js";
import { CodexAdapter } from "../src/adapters/codex.js";
import { canAutoRecoverToolFailure, isMeaningfulToolOutput } from "../src/index.js";
import type { ToolOutput } from "../src/index.js";

class FakeChildProcess extends EventEmitter {
  stdin = new PassThrough();
  stdout = new PassThrough();
  stderr = new PassThrough();
  pid = 12345;
}

const spawnedChildren: FakeChildProcess[] = [];

/** Stream close events are asynchronous; let readline observe stdout ending. */
const tick = () => new Promise((resolve) => setImmediate(resolve));

vi.mock("child_process", () => ({
  spawn: vi.fn(() => {
    const child = new FakeChildProcess();
    spawnedChildren.push(child);
    return child;
  }),
}));

function errorOutputs(
  onOutput: ReturnType<typeof vi.fn>,
): Extract<ToolOutput, { type: "error" }>[] {
  return onOutput.mock.calls
    .map(([output]) => output as ToolOutput)
    .filter((output): output is Extract<ToolOutput, { type: "error" }> => output.type === "error");
}

describe("adapter failure evidence", () => {
  beforeEach(() => {
    spawnedChildren.length = 0;
    vi.mocked(spawn).mockClear();
  });

  it("classifies a Claude missing conversation on resume from stderr, and control-only output does not block recovery", async () => {
    const adapter = new ClaudeCodeAdapter();
    const onOutput = vi.fn();

    adapter.run({
      prompt: "continue the task",
      cwd: "/tmp",
      onOutput,
      onComplete: vi.fn(),
      toolSessionId: "b40399a6-3361-486b-8174-7e4f316a03da",
    });

    const child = spawnedChildren[0];
    // The incident sequence: Claude reports a generic error result on stdout
    // before the useful stderr message arrives at exit.
    child.stdout.write(`${JSON.stringify({ type: "result", subtype: "error", is_error: true })}\n`);
    child.stderr.write(
      "No conversation found with session ID: b40399a6-3361-486b-8174-7e4f316a03da\n",
    );
    child.stdout.end();
    await tick();
    child.emit("close", 1);

    const [failureEvent] = errorOutputs(onOutput);
    expect(failureEvent.failure).toMatchObject({
      kind: "conversation_missing",
      confidence: "strong",
      matchedRule: "claude_code.resume.conversation_missing",
      evidence: {
        provider: "claude_code",
        operation: "resume",
        source: "stderr",
        exitCode: 1,
      },
    });

    const sawMeaningfulOutput = onOutput.mock.calls.some(([output]) =>
      isMeaningfulToolOutput(output as ToolOutput),
    );
    expect(sawMeaningfulOutput).toBe(false);
    expect(canAutoRecoverToolFailure(failureEvent.failure!, sawMeaningfulOutput)).toBe(true);
  });

  it("does not classify the same stderr as missing conversation on a fresh run", async () => {
    const adapter = new ClaudeCodeAdapter();
    const onOutput = vi.fn();

    adapter.run({ prompt: "start", cwd: "/tmp", onOutput, onComplete: vi.fn() });

    const child = spawnedChildren[0];
    child.stderr.write("No conversation found with session ID: something\n");
    child.stdout.end();
    await tick();
    child.emit("close", 1);

    const [failureEvent] = errorOutputs(onOutput);
    expect(failureEvent.failure).toMatchObject({ kind: "unknown", confidence: "unknown" });
    expect(canAutoRecoverToolFailure(failureEvent.failure!, false)).toBe(false);
  });

  it("blocks automatic replay once real assistant output has streamed", async () => {
    const adapter = new ClaudeCodeAdapter();
    const onOutput = vi.fn();

    adapter.run({
      prompt: "continue",
      cwd: "/tmp",
      onOutput,
      onComplete: vi.fn(),
      toolSessionId: "stale-session",
    });

    const child = spawnedChildren[0];
    child.stdout.write(
      `${JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "text", text: "Editing files now" }] },
      })}\n`,
    );
    child.stderr.write("No conversation found with session ID: stale-session\n");
    child.stdout.end();
    await tick();
    child.emit("close", 1);

    const [failureEvent] = errorOutputs(onOutput);
    expect(failureEvent.failure?.kind).toBe("conversation_missing");
    const sawMeaningfulOutput = onOutput.mock.calls.some(([output]) =>
      isMeaningfulToolOutput(output as ToolOutput),
    );
    expect(sawMeaningfulOutput).toBe(true);
    expect(canAutoRecoverToolFailure(failureEvent.failure!, sawMeaningfulOutput)).toBe(false);
  });

  it("classifies a missing CLI binary from the spawn error code", () => {
    const adapter = new ClaudeCodeAdapter();
    const onOutput = vi.fn();

    adapter.run({ prompt: "start", cwd: "/tmp", onOutput, onComplete: vi.fn() });

    spawnedChildren[0].emit(
      "error",
      Object.assign(new Error("spawn claude ENOENT"), { code: "ENOENT" }),
    );

    const [failureEvent] = errorOutputs(onOutput);
    expect(failureEvent.failure).toMatchObject({
      kind: "tool_missing",
      confidence: "exact",
      evidence: { provider: "claude_code", source: "process", processCode: "ENOENT" },
    });
  });

  it("classifies Codex structured error events as provider events", () => {
    const adapter = new CodexAdapter();
    const onOutput = vi.fn();

    adapter.run({
      prompt: "continue",
      cwd: "/tmp",
      onOutput,
      onComplete: vi.fn(),
      toolSessionId: "019ddf01-0be6-7b70-b978-94fad973c9d9",
    });

    spawnedChildren[0].stdout.write(
      `${JSON.stringify({
        type: "error",
        message:
          "thread/resume failed: no rollout found for thread id 019ddf01-0be6-7b70-b978-94fad973c9d9",
      })}\n`,
    );

    const [failureEvent] = errorOutputs(onOutput);
    expect(failureEvent.failure).toMatchObject({
      kind: "conversation_missing",
      confidence: "strong",
      evidence: { provider: "codex", operation: "resume", source: "provider_event" },
    });
  });
});
