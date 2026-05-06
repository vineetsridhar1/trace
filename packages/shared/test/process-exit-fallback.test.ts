import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { spawn } from "child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClaudeCodeAdapter } from "../src/adapters/claude-code.js";
import { CodexAdapter } from "../src/adapters/codex.js";

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
});
