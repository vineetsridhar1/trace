import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { spawn } from "child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AntigravityAdapter } from "../src/adapters/antigravity.js";
import { ClaudeCodeAdapter } from "../src/adapters/claude-code.js";
import { CodexAdapter } from "../src/adapters/codex.js";
import { PiAdapter } from "../src/adapters/pi.js";

class FakeChildProcess extends EventEmitter {
  stdin = new PassThrough();
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

  it("emits Codex turn usage on the result event", () => {
    const adapter = new CodexAdapter();
    const onOutput = vi.fn();
    const onComplete = vi.fn();

    adapter.run({
      prompt: "count tokens",
      cwd: "/tmp",
      onOutput,
      onComplete,
    });

    spawnedChildren[0].stdout.write(
      `${JSON.stringify({
        type: "turn.completed",
        usage: {
          input_tokens: 100,
          output_tokens: 25,
          input_token_details: {
            cached_tokens: 40,
            cache_creation_tokens: 5,
          },
        },
        cost_usd: 0.0123,
      })}\n`,
    );
    spawnedChildren[0].emit("close", 0);

    expect(onOutput).toHaveBeenCalledWith({
      type: "result",
      subtype: "success",
      usage: {
        inputTokens: 100,
        outputTokens: 25,
        cacheReadTokens: 40,
        cacheCreationTokens: 5,
      },
      costUsd: 0.0123,
    });
    expect(onOutput).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("normalizes Codex top-level token aliases", () => {
    const adapter = new CodexAdapter();
    const onOutput = vi.fn();
    const onComplete = vi.fn();

    adapter.run({
      prompt: "count tokens",
      cwd: "/tmp",
      onOutput,
      onComplete,
    });

    spawnedChildren[0].stdout.write(
      `${JSON.stringify({
        type: "turn.completed",
        prompt_tokens: 80,
        completion_tokens: 20,
        cached_input_tokens: 30,
        cache_creation_input_tokens: 4,
      })}\n`,
    );

    expect(onOutput).toHaveBeenCalledWith({
      type: "result",
      subtype: "success",
      usage: {
        inputTokens: 80,
        outputTokens: 20,
        cacheReadTokens: 30,
        cacheCreationTokens: 4,
      },
    });
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
      ],
      expect.objectContaining({ cwd: "/tmp", stdio: ["pipe", "pipe", "pipe"] }),
    );
    expect(spawnedChildren[0].stdin.read()?.toString()).toBe("implement feature");

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

  it("emits Pi message usage on the result event", () => {
    const adapter = new PiAdapter();
    const onOutput = vi.fn();
    const onComplete = vi.fn();

    adapter.run({
      prompt: "count tokens",
      cwd: "/tmp",
      onOutput,
      onComplete,
    });

    spawnedChildren[0].stdout.write(
      `${JSON.stringify({
        type: "message_end",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "done" }],
          usage: {
            input: 120,
            output: 30,
            cacheRead: 50,
            cacheWrite: 6,
            totalTokens: 206,
            cost: {
              input: 0.0012,
              output: 0.0009,
              cacheRead: 0.0002,
              cacheWrite: 0.0003,
              total: 0.0026,
            },
          },
        },
      })}\n`,
    );
    spawnedChildren[0].stdout.write(`${JSON.stringify({ type: "agent_end" })}\n`);

    expect(onOutput).toHaveBeenCalledWith({
      type: "result",
      subtype: "success",
      usage: {
        inputTokens: 120,
        outputTokens: 30,
        cacheReadTokens: 50,
        cacheCreationTokens: 6,
      },
      costUsd: 0.0026,
    });
  });

  it("emits Pi agent_end message usage when message_end omitted it", () => {
    const adapter = new PiAdapter();
    const onOutput = vi.fn();
    const onComplete = vi.fn();

    adapter.run({
      prompt: "count tokens",
      cwd: "/tmp",
      onOutput,
      onComplete,
    });

    spawnedChildren[0].stdout.write(
      `${JSON.stringify({
        type: "agent_end",
        messages: [
          {
            role: "assistant",
            content: [{ type: "text", text: "done" }],
            usage: {
              input: 80,
              output: 20,
              cacheRead: 25,
              cacheWrite: 4,
              totalTokens: 129,
              cost: {
                input: 0.0008,
                output: 0.0006,
                cacheRead: 0.0001,
                cacheWrite: 0.0002,
                total: 0.0017,
              },
            },
          },
        ],
      })}\n`,
    );

    expect(onOutput).toHaveBeenCalledWith({
      type: "result",
      subtype: "success",
      usage: {
        inputTokens: 80,
        outputTokens: 20,
        cacheReadTokens: 25,
        cacheCreationTokens: 4,
      },
      costUsd: 0.0017,
    });
  });

  it("completes an Antigravity run when the process exits but stdout never closes", () => {
    const adapter = new AntigravityAdapter();
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

  it("passes Antigravity print + resume flags and emits stdout as one assistant text block", () => {
    const adapter = new AntigravityAdapter();
    const onOutput = vi.fn();
    const onComplete = vi.fn();

    adapter.run({
      prompt: "implement feature",
      cwd: "/tmp",
      toolSessionId: "conv-123",
      onOutput,
      onComplete,
    });

    expect(spawn).toHaveBeenCalledWith(
      "agy",
      [
        "-p",
        "implement feature",
        "--dangerously-skip-permissions",
        "--print-timeout",
        "30m0s",
        "--conversation",
        "conv-123",
      ],
      expect.objectContaining({ cwd: "/tmp", stdio: ["ignore", "pipe", "pipe"] }),
    );

    spawnedChildren[0].stdout.write("Here is the result.\n");
    spawnedChildren[0].emit("close", 0);

    expect(onOutput).toHaveBeenCalledWith({
      type: "assistant",
      message: { content: [{ type: "text", text: "Here is the result." }] },
    });
    expect(onOutput).toHaveBeenCalledWith({ type: "result", subtype: "success" });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("captures Antigravity JSON usage metadata without rendering it as text", () => {
    const adapter = new AntigravityAdapter();
    const onOutput = vi.fn();
    const onComplete = vi.fn();

    adapter.run({
      prompt: "implement feature",
      cwd: "/tmp",
      onOutput,
      onComplete,
    });

    spawnedChildren[0].stdout.write(
      `${JSON.stringify({
        tokenUsage: {
          input: 90,
          output: 18,
          cacheRead: 32,
          cacheWrite: 3,
        },
        costUsd: 0.0042,
      })}\n`,
    );
    spawnedChildren[0].stdout.write("Here is the result.\n");
    spawnedChildren[0].emit("close", 0);

    expect(onOutput).toHaveBeenCalledWith({
      type: "assistant",
      message: { content: [{ type: "text", text: "Here is the result." }] },
    });
    expect(onOutput).toHaveBeenCalledWith({
      type: "result",
      subtype: "success",
      usage: {
        inputTokens: 90,
        outputTokens: 18,
        cacheReadTokens: 32,
        cacheCreationTokens: 3,
      },
      costUsd: 0.0042,
    });
  });

  it("wraps Antigravity output as a plan block in plan mode", () => {
    const adapter = new AntigravityAdapter();
    const onOutput = vi.fn();
    const onComplete = vi.fn();

    adapter.run({
      prompt: "draft a plan",
      cwd: "/tmp",
      interactionMode: "plan",
      onOutput,
      onComplete,
    });

    spawnedChildren[0].stdout.write("Step 1. Step 2.\n");
    spawnedChildren[0].emit("close", 0);

    expect(onOutput).toHaveBeenCalledWith({
      type: "assistant",
      message: { content: [{ type: "plan", content: "Step 1. Step 2." }] },
    });
  });

  it("passes prompts so leading hyphens are not parsed as flags", () => {
    const onOutput = vi.fn();
    const onComplete = vi.fn();

    new ClaudeCodeAdapter().run({
      prompt: "- fix this bug",
      cwd: "/tmp",
      onOutput,
      onComplete,
    });
    expect(spawn).toHaveBeenLastCalledWith(
      "claude",
      [
        "-p",
        "--input-format",
        "text",
        "--output-format",
        "stream-json",
        "--verbose",
        "--dangerously-skip-permissions",
      ],
      expect.objectContaining({ cwd: "/tmp", stdio: ["pipe", "pipe", "pipe"] }),
    );
    expect(spawnedChildren[0].stdin.read()?.toString()).toBe("- fix this bug");

    new CodexAdapter().run({
      prompt: "- fix this bug",
      cwd: "/tmp",
      onOutput,
      onComplete,
    });
    expect(spawn).toHaveBeenLastCalledWith(
      "codex",
      ["exec", "--json", "--dangerously-bypass-approvals-and-sandbox", "-"],
      expect.objectContaining({ cwd: "/tmp", stdio: ["pipe", "pipe", "pipe"] }),
    );
    expect(spawnedChildren[1].stdin.read()?.toString()).toBe("- fix this bug");

    new PiAdapter().run({
      prompt: "- fix this bug",
      cwd: "/tmp",
      onOutput,
      onComplete,
    });
    expect(spawn).toHaveBeenLastCalledWith(
      "pi",
      ["--mode", "json"],
      expect.objectContaining({ cwd: "/tmp", stdio: ["pipe", "pipe", "pipe"] }),
    );
    expect(spawnedChildren[2].stdin.read()?.toString()).toBe("- fix this bug");
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
