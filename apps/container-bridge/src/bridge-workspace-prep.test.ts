import { beforeEach, describe, expect, it, vi } from "vitest";
import os from "node:os";
import { WorkspaceRegistry, type BridgeCommand, type BridgeMessage } from "@trace/shared";
import { WorkspacePreparationBarrier } from "./workspace-preparation.js";

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

type BridgeHarness = {
  handleCommand: (command: BridgeCommand) => void;
  workspaces: WorkspaceRegistry;
  workspacePreparations: WorkspacePreparationBarrier;
  runPrompt: ReturnType<typeof vi.fn>;
  sent: BridgeMessage[];
};

function createHarness(): BridgeHarness {
  const bridge = new ContainerBridge("ws://trace.test", "token", "runtime-1", "codex", false);
  const internals = bridge as unknown as {
    handleCommand: (command: BridgeCommand) => void;
    workspaces: WorkspaceRegistry;
    workspacePreparations: WorkspacePreparationBarrier;
    runPrompt: ReturnType<typeof vi.fn>;
    send: (message: BridgeMessage) => void;
  };
  const sent: BridgeMessage[] = [];
  internals.runPrompt = vi.fn().mockResolvedValue(undefined);
  internals.send = (message) => sent.push(message);
  return {
    handleCommand: internals.handleCommand.bind(bridge),
    workspaces: internals.workspaces,
    workspacePreparations: internals.workspacePreparations,
    runPrompt: internals.runPrompt,
    sent,
  };
}

describe("ContainerBridge workspace preparation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("holds an early agent command until the prepared workspace is ready", async () => {
    const harness = createHarness();
    let finish!: () => void;
    const preparation = new Promise<void>((resolve) => {
      finish = resolve;
    });
    harness.workspacePreparations.track("session:session-1", preparation);

    harness.handleCommand({
      type: "run",
      sessionId: "session-1",
      workspaceMode: "prepared",
      prompt: "continue",
    });
    await Promise.resolve();
    expect(harness.runPrompt).not.toHaveBeenCalled();

    harness.workspaces.set("session-1", "/workspaces/ibex-2");
    finish();

    await vi.waitFor(() => expect(harness.runPrompt).toHaveBeenCalledTimes(1));
    expect(harness.runPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: "/workspaces/ibex-2", prompt: "continue" }),
    );
  });

  it("rejects a reconnect path that is no longer on disk", () => {
    const harness = createHarness();
    harness.handleCommand({
      type: "track_session",
      sessionId: "session-1",
      workdir: `${os.tmpdir()}/trace-workspace-that-does-not-exist`,
    });

    expect(harness.sent).toContainEqual(
      expect.objectContaining({
        type: "workspace_failed",
        error: expect.stringContaining("no longer exists"),
      }),
    );
    expect(harness.workspaces.has("session-1")).toBe(false);
  });
});
