import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { spawn } from "child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClaudeCodeAdapter } from "../src/adapters/claude-code.js";
import { CodexAdapter } from "../src/adapters/codex.js";
import { PiAdapter } from "../src/adapters/pi.js";

class FakeChildProcess extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  pid = 12345;
}

const spawnedChildren: FakeChildProcess[] = [];

vi.mock("child_process", () => ({
  spawn: vi.fn(() => {
    const child = new FakeChildProcess();
    spawnedChildren.push(child);
    return child;
  }),
}));

describe("coding tool adapter process exit fallback", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    spawnedChildren.length = 0;
    vi.mocked(spawn).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("completes a Codex run when the process exits but stdio never closes", () => {
    const adapter = new CodexAdapter();
    const onOutput = vi.fn();
    const onComplete = vi.fn();

    adapter.run({
      prompt: "wait for checks",
      cwd: "/tmp",
      onOutput,
      onComplete,
    });

    spawnedChildren[0].emit("exit", 0);
    vi.advanceTimersByTime(999);
    expect(onComplete).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onOutput).toHaveBeenCalledWith({ type: "result", subtype: "success" });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("completes a Claude Code run when the process exits but stdout never closes", () => {
    const adapter = new ClaudeCodeAdapter();
    const onOutput = vi.fn();
    const onComplete = vi.fn();

    adapter.run({
      prompt: "wait for checks",
      cwd: "/tmp",
      onOutput,
      onComplete,
    });

    spawnedChildren[0].emit("exit", 0);
    vi.advanceTimersByTime(999);
    expect(onComplete).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onOutput).toHaveBeenCalledWith({ type: "result", subtype: "success" });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("completes a Pi run when the process exits but stdio never closes", () => {
    const adapter = new PiAdapter();
    const onOutput = vi.fn();
    const onComplete = vi.fn();

    adapter.run({
      prompt: "wait for checks",
      cwd: "/tmp",
      onOutput,
      onComplete,
    });

    spawnedChildren[0].emit("exit", 0);
    vi.advanceTimersByTime(999);
    expect(onComplete).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onOutput).toHaveBeenCalledWith({ type: "result", subtype: "success" });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("passes Pi model, thinking, and session flags and normalizes JSON events", () => {
    const adapter = new PiAdapter();
    const onOutput = vi.fn();
    const onComplete = vi.fn();

    adapter.run({
      prompt: "implement feature",
      cwd: "/tmp",
      model: "openai/gpt-5.5",
      reasoningEffort: "high",
      toolSessionId: "session-123",
      onOutput,
      onComplete,
    });

    expect(spawn).toHaveBeenCalledWith(
      "pi",
      [
        "--mode",
        "json",
        "--session",
        "session-123",
        "--model",
        "openai/gpt-5.5",
        "--thinking",
        "high",
        "implement feature",
      ],
      expect.objectContaining({ cwd: "/tmp" }),
    );

    spawnedChildren[0].stdout.write(
      `${JSON.stringify({ type: "session", version: 3, id: "session-456" })}\n`,
    );
    spawnedChildren[0].stdout.write(
      `${JSON.stringify({
        type: "tool_execution_start",
        toolCallId: "call-1",
        toolName: "bash",
        args: { command: "pnpm test" },
      })}\n`,
    );
    spawnedChildren[0].stdout.write(
      `${JSON.stringify({
        type: "tool_execution_end",
        toolCallId: "call-1",
        toolName: "bash",
        result: { content: [{ type: "text", text: "ok" }] },
        isError: false,
      })}\n`,
    );
    spawnedChildren[0].stdout.write(
      `${JSON.stringify({
        type: "message_end",
        message: { role: "assistant", content: [{ type: "text", text: "done" }] },
      })}\n`,
    );

    expect(adapter.getSessionId()).toBe("session-456");
    expect(onOutput).toHaveBeenCalledWith({
      type: "assistant",
      message: {
        content: [
          {
            type: "tool_use",
            id: "call-1",
            name: "bash",
            input: { command: "pnpm test" },
          },
        ],
      },
    });
    expect(onOutput).toHaveBeenCalledWith({
      type: "assistant",
      message: {
        content: [
          {
            type: "tool_result",
            tool_use_id: "call-1",
            name: "bash",
            content: "ok",
          },
        ],
      },
    });
    expect(onOutput).toHaveBeenCalledWith({
      type: "assistant",
      message: { content: [{ type: "text", text: "done" }] },
    });
  });

  it("marks Pi runs as failed when assistant events report an error stop reason", () => {
    const adapter = new PiAdapter();
    const onOutput = vi.fn();
    const onComplete = vi.fn();

    adapter.run({
      prompt: "use bad model",
      cwd: "/tmp",
      onOutput,
      onComplete,
    });

    spawnedChildren[0].stdout.write(
      `${JSON.stringify({
        type: "message_end",
        message: {
          role: "assistant",
          stopReason: "error",
          errorMessage: "Model is not available",
          content: [],
        },
      })}\n`,
    );
    spawnedChildren[0].stdout.write(`${JSON.stringify({ type: "agent_end" })}\n`);

    expect(onOutput).toHaveBeenCalledWith({
      type: "error",
      message: "Model is not available",
    });
    expect(onOutput).toHaveBeenCalledWith({ type: "result", subtype: "error" });
  });
});
