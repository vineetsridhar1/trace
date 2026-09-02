import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BridgeMessage } from "@trace/shared";

const { createWorktreeMock } = vi.hoisted(() => ({ createWorktreeMock: vi.fn() }));

vi.mock("ws", async () => {
  const { EventEmitter } = await import("node:events");
  class MockWebSocket extends EventEmitter {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    readyState = MockWebSocket.CONNECTING;
    constructor(_url: string, _options?: unknown) {
      super();
    }
    close(): void {}
    send(_data: string): void {}
  }
  return { default: MockWebSocket };
});

vi.mock("@trace/shared/adapters", () => {
  class MockAdapter {}
  class MockTerminalManager {
    destroyAll(): void {}
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

vi.mock("./config.js", () => ({
  getBridgeLabel: () => null,
  getOrCreateInstanceId: () => "bridge-test",
  getRepoConfig: () => ({ path: "/tmp/repo" }),
  readConfig: () => ({ repos: {}, bridgeLabel: null }),
}));

vi.mock("./runtime-debug.js", () => ({
  runtimeDebug: vi.fn(),
}));

vi.mock("./worktree.js", () => ({
  createWorktree: createWorktreeMock,
  adoptWorktree: vi.fn(),
  removeWorktree: vi.fn(),
  listRepoWorktrees: vi.fn(),
  isTraceManagedWorktreePath: () => true,
}));

import { BridgeClient } from "./bridge.js";

type RunPromptArgs = { sessionId: string; prompt: string; cwd?: string };

type Harness = {
  handleCommand: (cmd: unknown) => void;
  sent: BridgeMessage[];
  runPrompt: ReturnType<typeof vi.fn>;
};

const PREPARE = {
  type: "prepare",
  sessionId: "session-1",
  sessionGroupId: "group-1",
  slug: "coyote",
  repoId: "repo-1",
  repoName: "mortgages",
  repoRemoteUrl: "git@example.com:acme/mortgages.git",
  defaultBranch: "main",
  branch: "trace-coyote",
};

const SEND = {
  type: "send",
  sessionId: "session-1",
  prompt: "keep going",
  cwd: "/stale/workdir",
  workspaceMode: "prepared",
  tool: "codex",
};

function createHarness(): Harness {
  const client = Object.create(BridgeClient.prototype) as BridgeClient;
  const sent: BridgeMessage[] = [];
  const runPrompt = vi.fn().mockResolvedValue(undefined);

  Object.assign(client as unknown as Record<string, unknown>, {
    sessionWorkdirs: new Map<string, string>(),
    sessionGroupIds: new Map<string, string | null>(),
    pendingWorktrees: new Map(),
    sessionPrepares: new Map(),
    workspacePrepareVersions: new Map(),
    nextWorkspacePrepareVersion: 0,
    readOnlySessions: new Set<string>(),
    send: (msg: BridgeMessage) => sent.push(msg),
    pollLocalPrStatuses: vi.fn().mockResolvedValue(undefined),
    runPrompt,
  });

  const internals = client as unknown as { handleCommand: (cmd: unknown) => void };
  return { handleCommand: (cmd) => internals.handleCommand(cmd), sent, runPrompt };
}

describe("BridgeClient workspace prep gating", () => {
  beforeEach(() => {
    createWorktreeMock.mockReset();
  });

  it("waits for in-flight prep and runs in the prepared workdir", async () => {
    let resolvePrep: (value: { workdir: string; branch: string; slug: string }) => void = () => {};
    createWorktreeMock.mockReturnValue(
      new Promise((resolve) => {
        resolvePrep = resolve;
      }),
    );

    const { handleCommand, sent, runPrompt } = createHarness();
    handleCommand(PREPARE);
    handleCommand(SEND);

    // Prep is still running: nothing may touch the tree yet.
    await Promise.resolve();
    await Promise.resolve();
    expect(sent).toHaveLength(0);
    expect(runPrompt).not.toHaveBeenCalled();

    resolvePrep({ workdir: "/prepared/coyote", branch: "trace-coyote", slug: "coyote" });

    await vi.waitFor(() => expect(runPrompt).toHaveBeenCalledTimes(1));
    expect(sent).toEqual([
      expect.objectContaining({ type: "workspace_ready", workdir: "/prepared/coyote" }),
    ]);
    const args = runPrompt.mock.calls[0][0] as RunPromptArgs;
    expect(args).toMatchObject({
      sessionId: "session-1",
      prompt: "keep going",
      cwd: "/prepared/coyote",
    });
  });

  it("refuses a failed-prep prompt and runs only after the service redelivers", async () => {
    createWorktreeMock
      .mockRejectedValueOnce(
        new Error(
          "warning: failed to remove tmp/cache/bootsnap/compile-cache-iseq/3e: Directory not empty",
        ),
      )
      .mockResolvedValueOnce({
        workdir: "/prepared/coyote",
        branch: "trace-coyote",
        slug: "coyote",
      });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const { handleCommand, sent, runPrompt } = createHarness();
    handleCommand(PREPARE);
    handleCommand(SEND);

    await vi.waitFor(() =>
      expect(sent).toEqual([expect.objectContaining({ type: "workspace_failed" })]),
    );
    expect(runPrompt).not.toHaveBeenCalled();

    // The service remains the durable owner. It redelivers only after a retry
    // has prepared the workspace successfully.
    handleCommand(PREPARE);
    await vi.waitFor(() =>
      expect(sent).toContainEqual(
        expect.objectContaining({ type: "workspace_ready", workdir: "/prepared/coyote" }),
      ),
    );
    expect(runPrompt).not.toHaveBeenCalled();
    handleCommand(SEND);

    await vi.waitFor(() => expect(runPrompt).toHaveBeenCalledTimes(1));
    const args = runPrompt.mock.calls[0][0] as RunPromptArgs;
    expect(args).toMatchObject({ prompt: "keep going", cwd: "/prepared/coyote" });
  });

  it("refuses a prepared-workspace prompt that arrives after prep already failed", async () => {
    createWorktreeMock.mockRejectedValue(new Error("git worktree add timed out after 600s"));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const { handleCommand, sent, runPrompt } = createHarness();
    handleCommand(PREPARE);
    await vi.waitFor(() =>
      expect(sent).toEqual([expect.objectContaining({ type: "workspace_failed" })]),
    );

    // Nothing is in flight any more, and the server's `cwd` is the session's
    // stored workdir — empty, because no prep has ever succeeded. Running now
    // would drop the coding tool outside every worktree.
    handleCommand({ ...SEND, cwd: "" });

    await vi.waitFor(() => expect(runPrompt).not.toHaveBeenCalled());
  });

  it("uses only the bridge-tracked path for a prepared workspace", async () => {
    const { handleCommand, runPrompt } = createHarness();
    handleCommand({
      type: "track_session",
      sessionId: "session-1",
      workdir: os.homedir(),
    });
    handleCommand(SEND);

    await vi.waitFor(() => expect(runPrompt).toHaveBeenCalledTimes(1));
    const args = runPrompt.mock.calls[0][0] as RunPromptArgs;
    expect(args.cwd).toBe(os.homedir());
  });

  it("refuses to restore a tracked workspace that no longer exists", async () => {
    const { handleCommand, sent, runPrompt } = createHarness();
    handleCommand({
      type: "track_session",
      sessionId: "session-1",
      workdir: "/missing/trace/workspace",
    });

    expect(sent).toContainEqual(
      expect.objectContaining({
        type: "workspace_failed",
        error: expect.stringContaining("no longer exists"),
      }),
    );
    handleCommand(SEND);
    await vi.waitFor(() => expect(runPrompt).not.toHaveBeenCalled());
  });

  it("allows home-directory execution only when the command opts in", async () => {
    const { handleCommand, runPrompt } = createHarness();
    handleCommand({ ...SEND, workspaceMode: "home", cwd: "" });

    await vi.waitFor(() => expect(runPrompt).toHaveBeenCalledTimes(1));
    const args = runPrompt.mock.calls[0][0] as RunPromptArgs;
    expect(args.cwd).toBeTruthy();
    expect(args.cwd).not.toBe("/stale/workdir");
  });

  it("uses home mode when an older server sends prepare_general", async () => {
    const { handleCommand, sent, runPrompt } = createHarness();
    handleCommand({ type: "prepare_general", sessionId: "session-1", sessionGroupId: "group-1" });
    handleCommand({ ...SEND, workspaceMode: undefined });

    await vi.waitFor(() => expect(runPrompt).toHaveBeenCalledTimes(1));
    expect(sent).toContainEqual(expect.objectContaining({ type: "workspace_ready" }));
    const args = runPrompt.mock.calls[0][0] as RunPromptArgs;
    expect(args.cwd).not.toBe("/stale/workdir");
  });

  it("acknowledges deprecated general-workspace cleanup", () => {
    const { handleCommand, sent } = createHarness();
    handleCommand({ type: "cleanup_general_workspace", sessionId: "session-1" });

    expect(sent).toEqual([
      { type: "cleanup_general_workspace_result", sessionId: "session-1", success: true },
    ]);
  });
});
