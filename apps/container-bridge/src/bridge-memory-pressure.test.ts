import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BridgeMessage, CodingToolAdapter } from "@trace/shared";

vi.mock("ws", async () => {
  const { EventEmitter } = await import("node:events");
  class MockWebSocket extends EventEmitter {
    static readonly OPEN = 1;
    readyState = 0;
    close(): void {}
    send(): void {}
  }
  return { default: MockWebSocket };
});

vi.mock("@trace/shared/adapters", () => {
  class MockAdapter {}
  class MockTerminalManager {
    constructor(_options: unknown) {}
    destroyAll(): void {}
    getActiveTerminals(): never[] {
      return [];
    }
  }
  return {
    AntigravityAdapter: MockAdapter,
    ClaudeCodeAdapter: MockAdapter,
    CodexAdapter: MockAdapter,
    CursorComposerAdapter: MockAdapter,
    PiAdapter: MockAdapter,
    resolveExecutable: () => null,
    TerminalManager: MockTerminalManager,
  };
});

vi.mock("@trace/shared/trace-runtime", () => ({
  ensureTraceRuntime: vi.fn().mockResolvedValue({ skillsDir: "/tmp/trace-skills" }),
}));

vi.mock("./runtime-skills.js", () => ({
  installRuntimeSkillsForCodingTools: vi.fn().mockResolvedValue(undefined),
}));

import { ContainerBridge } from "./bridge.js";

describe("ContainerBridge memory pressure", () => {
  beforeEach(() => vi.clearAllMocks());

  it("aborts active runs and preserves the bridge", () => {
    const bridge = new ContainerBridge("ws://trace.test", "token", "runtime-1", "codex", false);
    const abort = vi.fn();
    const sent: BridgeMessage[] = [];
    const terminalDestroyAll = vi.fn();
    const processDestroyAll = vi.fn();
    const processRecover = vi.fn();
    const internals = bridge as unknown as {
      adapters: Map<string, CodingToolAdapter>;
      activeRuns: Map<string, number>;
      startRun: (sessionId: string, invocationId?: string) => number;
      send: (message: BridgeMessage) => void;
      terminalManager: { destroyAll: (signal?: string) => void };
      managedProcessManager: {
        destroyAllImmediately: () => void;
        recoverFromMemoryPressure: () => void;
      };
    };
    internals.adapters.set("session-1", { abort } as unknown as CodingToolAdapter);
    internals.startRun("session-1", "invocation-1");
    internals.send = (message) => sent.push(message);
    internals.terminalManager = { destroyAll: terminalDestroyAll };
    internals.managedProcessManager = {
      destroyAllImmediately: processDestroyAll,
      recoverFromMemoryPressure: processRecover,
    };

    bridge.handleMemoryPressure({
      currentBytes: 58 * 1024 ** 3,
      maxBytes: 64 * 1024 ** 3,
      utilization: 58 / 64,
    });

    expect(abort).toHaveBeenCalledWith(true);
    expect(internals.activeRuns.has("session-1")).toBe(true);
    expect(terminalDestroyAll).toHaveBeenCalledWith("SIGKILL");
    expect(processDestroyAll).toHaveBeenCalledOnce();
    expect(sent).toContainEqual(
      expect.objectContaining({
        type: "session_output",
        sessionId: "session-1",
        data: expect.objectContaining({ type: "error", message: expect.stringContaining("91%") }),
      }),
    );
    expect(sent).not.toContainEqual(expect.objectContaining({ type: "session_complete" }));

    bridge.handleMemoryRecovery({
      currentBytes: 40 * 1024 ** 3,
      maxBytes: 64 * 1024 ** 3,
      utilization: 40 / 64,
    });

    expect(processRecover).toHaveBeenCalledOnce();
    expect(internals.activeRuns.has("session-1")).toBe(false);
    expect(sent).toContainEqual({
      type: "session_complete",
      sessionId: "session-1",
      outcome: "failed",
      reason: "runtime_memory_pressure",
      invocationId: "invocation-1",
    });
  });
});
