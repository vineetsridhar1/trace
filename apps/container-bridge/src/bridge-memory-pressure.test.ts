import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BridgeCommand, BridgeMessage, CodingToolAdapter } from "@trace/shared";

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
  ensureTraceRuntime: vi
    .fn()
    .mockResolvedValue({ skillsDir: "/tmp/trace-skills", binDir: "/tmp/trace-bin" }),
}));

vi.mock("./runtime-skills.js", () => ({
  installRuntimeSkillsForCodingTools: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./tool-auth.js", () => ({
  ensureToolReady: vi.fn().mockResolvedValue(undefined),
  syncCodexAuthFile: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./playwright-session.js", () => ({
  createPlaywrightInvocationSession: vi
    .fn()
    .mockResolvedValue({
      invocationId: "pending-invocation",
      sessionName: "browser",
      outputDir: "/tmp/browser",
      env: {},
    }),
  cleanupPlaywrightInvocationSession: vi.fn().mockResolvedValue(undefined),
}));

import { ContainerBridge } from "./bridge.js";
import { ensureToolReady } from "./tool-auth.js";
import {
  createPlaywrightInvocationSession,
  cleanupPlaywrightInvocationSession,
} from "./playwright-session.js";
import type { PlaywrightInvocationSession } from "./playwright-session.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function preparingHarness() {
  const bridge = new ContainerBridge("ws://trace.test", "token", "runtime-1", "codex", false);
  const run = vi.fn();
  const sent: BridgeMessage[] = [];
  const internals = bridge as unknown as {
    handleCommand: (command: BridgeCommand) => void;
    waitForWorkspacePreparation: () => Promise<boolean>;
    createAdapter: () => CodingToolAdapter;
    send: (message: BridgeMessage) => void;
    playwrightSessions: Map<string, PlaywrightInvocationSession>;
    terminalManager: { create: ReturnType<typeof vi.fn>; destroyAll: ReturnType<typeof vi.fn> };
    managedProcessManager: {
      runSetupScript: ReturnType<typeof vi.fn>;
      start: ReturnType<typeof vi.fn>;
      destroyAllImmediately: ReturnType<typeof vi.fn>;
      recoverFromMemoryPressure: ReturnType<typeof vi.fn>;
    };
  };
  internals.createAdapter = () => ({ run, abort: vi.fn() }) as unknown as CodingToolAdapter;
  internals.send = (message) => sent.push(message);
  internals.terminalManager = { create: vi.fn(), destroyAll: vi.fn() };
  internals.managedProcessManager = {
    runSetupScript: vi.fn(),
    start: vi.fn(),
    destroyAllImmediately: vi.fn(),
    recoverFromMemoryPressure: vi.fn(),
  };
  const shedAndRecover = () => {
    bridge.handleMemoryPressure({ currentBytes: 90, maxBytes: 100, utilization: 0.9 });
    bridge.handleMemoryRecovery({ currentBytes: 50, maxBytes: 100, utilization: 0.5 });
  };
  const start = () =>
    internals.handleCommand({
      type: "run",
      sessionId: "preparing",
      workspaceMode: "home",
      prompt: "continue",
      runtimeEnv: { TRACE_INVOCATION_ID: "pending-invocation" },
    });
  return { internals, run, sent, shedAndRecover, start };
}

describe("ContainerBridge memory pressure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ensureToolReady).mockResolvedValue(undefined);
  });

  it("cancels a run awaiting workspace preparation even after memory recovers", async () => {
    const harness = preparingHarness();
    const workspace = deferred<boolean>();
    harness.internals.waitForWorkspacePreparation = () => workspace.promise;
    harness.start();
    harness.shedAndRecover();
    workspace.resolve(true);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(harness.run).not.toHaveBeenCalled();
    expect(harness.sent.filter((message) => message.type === "session_complete")).toEqual([
      {
        type: "session_complete",
        sessionId: "preparing",
        invocationId: "pending-invocation",
        outcome: "failed",
        reason: "runtime_memory_pressure",
      },
    ]);
  });

  it("does not launch an agent whose tool preparation crossed memory pressure", async () => {
    const harness = preparingHarness();
    const tool = deferred<void>();
    vi.mocked(ensureToolReady).mockReturnValueOnce(tool.promise);
    harness.start();
    await vi.waitFor(() => expect(ensureToolReady).toHaveBeenCalledOnce());
    harness.shedAndRecover();
    tool.resolve();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(harness.run).not.toHaveBeenCalled();
    expect(harness.sent).toContainEqual(
      expect.objectContaining({
        type: "session_complete",
        invocationId: "pending-invocation",
        outcome: "failed",
      }),
    );
  });

  it("cleans browser resources that finish preparing after the run was cancelled", async () => {
    const harness = preparingHarness();
    const browser = deferred<PlaywrightInvocationSession>();
    vi.mocked(createPlaywrightInvocationSession).mockReturnValueOnce(browser.promise);
    harness.start();
    await vi.waitFor(() => expect(createPlaywrightInvocationSession).toHaveBeenCalledOnce());
    harness.shedAndRecover();
    const session = {
      invocationId: "pending-invocation",
      sessionName: "browser",
      outputDir: "/tmp/browser",
      env: {},
    };
    browser.resolve(session);
    await vi.waitFor(() =>
      expect(cleanupPlaywrightInvocationSession).toHaveBeenCalledWith(session),
    );
    expect(harness.internals.playwrightSessions.size).toBe(0);
    expect(harness.run).not.toHaveBeenCalled();
  });

  it.each(["terminal", "application", "setup script"] as const)(
    "cancels a queued %s launch across memory recovery",
    async (kind) => {
      const harness = preparingHarness();
      const workspace = deferred<boolean>();
      harness.internals.waitForWorkspacePreparation = () => workspace.promise;
      harness.internals.handleCommand(
        kind === "terminal"
          ? {
              type: "terminal_create",
              sessionId: "preparing",
              terminalId: "terminal",
              ownerUserId: "user",
              cwd: "/tmp",
              cols: 80,
              rows: 24,
            }
          : kind === "application"
            ? {
                type: "app_process_start",
                sessionId: "preparing",
                sessionGroupId: "group",
                requestId: "request",
                processInstanceId: "process",
                appConfigId: "app",
                processConfigId: "config",
                command: "npm start",
                cwd: "/tmp",
                env: {},
                ports: [],
              }
            : {
                type: "setup_script_run",
                sessionId: "preparing",
                sessionGroupId: "group",
                requestId: "setup",
                command: "npm install",
                cwd: "/tmp",
                env: {},
              },
      );
      harness.shedAndRecover();
      workspace.resolve(true);
      await vi.waitFor(() =>
        expect(harness.sent).toContainEqual(
          expect.objectContaining({
            type:
              kind === "terminal"
                ? "terminal_error"
                : kind === "application"
                  ? "app_process_error"
                  : "setup_script_result",
            error: expect.stringContaining("memory pressure"),
          }),
        ),
      );
      expect(harness.internals.terminalManager.create).not.toHaveBeenCalled();
      expect(harness.internals.managedProcessManager.start).not.toHaveBeenCalled();
      expect(harness.internals.managedProcessManager.runSetupScript).not.toHaveBeenCalled();
    },
  );

  it("ignores a cancelled preparation rejection while allowing a fresh run after recovery", async () => {
    const harness = preparingHarness();
    const tool = deferred<void>();
    vi.mocked(ensureToolReady).mockReturnValueOnce(tool.promise);
    harness.start();
    await vi.waitFor(() => expect(ensureToolReady).toHaveBeenCalledOnce());
    harness.shedAndRecover();
    harness.start();
    await vi.waitFor(() => expect(harness.run).toHaveBeenCalledOnce());
    tool.reject(new Error("Cancelled tool preparation"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(harness.sent.filter((message) => message.type === "session_complete")).toEqual([
      {
        type: "session_complete",
        sessionId: "preparing",
        invocationId: "pending-invocation",
        outcome: "failed",
        reason: "runtime_memory_pressure",
      },
    ]);
    expect(cleanupPlaywrightInvocationSession).not.toHaveBeenCalled();
    expect(harness.internals.playwrightSessions.size).toBe(1);
  });

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
