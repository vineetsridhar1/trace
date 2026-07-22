import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  registerRuntime: vi.fn(),
  unregisterRuntime: vi.fn(),
  recordHeartbeat: vi.fn(() => true),
  addRegisteredRepo: vi.fn(),
  bindSession: vi.fn(),
  getRuntime: vi.fn(() => undefined),
  getRuntimeForSession: vi.fn(() => undefined),
  getBoundSessionIds: vi.fn(() => []),
  getHeartbeatReconcileSessionIds: vi.fn(() => []),
  getLinkedCheckoutStatus: vi.fn(() => Promise.resolve()),
  restoreSessionsForRuntime: vi.fn(() => Promise.resolve()),
  recordOutput: vi.fn(() => Promise.resolve()),
  complete: vi.fn(() => Promise.resolve()),
  listIdleActiveRunSessionIds: vi.fn(() => Promise.resolve([])),
  reconcileIdleActiveRuns: vi.fn(() => Promise.resolve([])),
  syncPrObservation: vi.fn(() => Promise.resolve()),
  registerLocalRuntimeConnection: vi.fn(),
  addRegisteredRepoToLocalRuntime: vi.fn(() => Promise.resolve()),
  restoreTerminals: vi.fn(() => Promise.resolve()),
  relayFromBridge: vi.fn(),
  sessionFindFirst: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("./session-router.js", () => ({
  runtimeRouterKey: (runtimeInstanceId: string, organizationId: string) =>
    `${organizationId}:${runtimeInstanceId}`,
  sessionRouter: {
    registerRuntime: mocks.registerRuntime,
    unregisterRuntime: mocks.unregisterRuntime,
    recordHeartbeat: mocks.recordHeartbeat,
    addRegisteredRepo: mocks.addRegisteredRepo,
    bindSession: mocks.bindSession,
    getRuntime: mocks.getRuntime,
    getRuntimeForSession: mocks.getRuntimeForSession,
    getBoundSessionIds: mocks.getBoundSessionIds,
    getHeartbeatReconcileSessionIds: mocks.getHeartbeatReconcileSessionIds,
    getLinkedCheckoutStatus: mocks.getLinkedCheckoutStatus,
    resolveLinkedCheckoutStatusRequest: vi.fn(),
    resolveLinkedCheckoutActionRequest: vi.fn(),
    resolveSessionGitSyncStatusRequest: vi.fn(),
    resolveSessionCurrentBranchRequest: vi.fn(),
    resolveBranchRequest: vi.fn(),
    resolveFileRequest: vi.fn(),
    resolveFileContentRequest: vi.fn(),
    resolveBranchDiffRequest: vi.fn(),
    resolveFileAtRefRequest: vi.fn(),
    resolveSkillsRequest: vi.fn(),
  },
}));

vi.mock("../services/session.js", () => ({
  sessionService: {
    restoreSessionsForRuntime: mocks.restoreSessionsForRuntime,
    recordOutput: mocks.recordOutput,
    complete: mocks.complete,
    listIdleActiveRunSessionIds: mocks.listIdleActiveRunSessionIds,
    reconcileIdleActiveRuns: mocks.reconcileIdleActiveRuns,
    syncPrObservation: mocks.syncPrObservation,
    workspaceReady: vi.fn(() => Promise.resolve()),
    workspaceFailed: vi.fn(() => Promise.resolve()),
    storeToolSessionId: vi.fn(() => Promise.resolve()),
    recoverMissingToolSession: vi.fn(() => Promise.resolve()),
    recordGitCheckpoint: vi.fn(() => Promise.resolve()),
    markConnectionLost: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock("./runtime-debug.js", () => ({
  runtimeDebug: vi.fn(),
}));

vi.mock("./terminal-relay.js", () => ({
  terminalRelay: {
    restoreTerminals: mocks.restoreTerminals,
    relayFromBridge: mocks.relayFromBridge,
  },
}));

vi.mock("../services/runtime-access.js", () => ({
  runtimeAccessService: {
    registerLocalRuntimeConnection: mocks.registerLocalRuntimeConnection,
    addRegisteredRepoToLocalRuntime: mocks.addRegisteredRepoToLocalRuntime,
    markRuntimeDisconnected: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock("../services/agent-environment.js", () => ({
  agentEnvironmentService: {
    ensureLocalBridgeEnvironment: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock("./db.js", () => ({
  prisma: {
    session: {
      findFirst: mocks.sessionFindFirst,
    },
  },
}));

import { handleBridgeConnection } from "./bridge-handler.js";
import { AuthorizationError } from "./errors.js";

type Handler = (payload?: unknown) => void;

function createMockWs() {
  const handlers = new Map<string, Handler>();
  return {
    OPEN: 1,
    readyState: 1,
    send: vi.fn(),
    close: vi.fn(),
    ping: vi.fn(),
    terminate: vi.fn(),
    on: vi.fn((event: string, handler: Handler) => {
      handlers.set(event, handler);
    }),
    emitMessage(payload: unknown) {
      handlers.get("message")?.(JSON.stringify(payload));
    },
  };
}

describe("bridge handler auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRuntimeForSession.mockReturnValue(undefined);
    mocks.getBoundSessionIds.mockReturnValue([]);
    mocks.getHeartbeatReconcileSessionIds.mockReturnValue([]);
    mocks.recordHeartbeat.mockReturnValue(true);
    mocks.listIdleActiveRunSessionIds.mockResolvedValue([]);
    mocks.sessionFindFirst.mockResolvedValue(null);
  });

  it("rejects a local bridge token that announces another runtime instance", async () => {
    const ws = createMockWs();

    handleBridgeConnection(ws as never, {
      bridgeAuth: {
        kind: "local",
        instanceId: "bridge-owned",
        organizationId: "org-1",
        userId: "user-1",
      },
    });
    ws.emitMessage({
      type: "runtime_hello",
      instanceId: "bridge-victim",
      hostingMode: "local",
    });
    await Promise.resolve();

    expect(ws.close).toHaveBeenCalledWith(1008, "Bridge auth mismatch");
    expect(mocks.registerRuntime).not.toHaveBeenCalled();
  });

  it("ignores repo_linked messages without a string repo id", async () => {
    const ws = createMockWs();
    mocks.registerLocalRuntimeConnection.mockResolvedValueOnce({
      id: "bridge-runtime-1",
      label: "Laptop",
      organizationId: "org-1",
      ownerUserId: "user-1",
    });

    handleBridgeConnection(ws as never, {
      bridgeAuth: {
        kind: "local",
        instanceId: "bridge-owned",
        organizationId: "org-1",
        userId: "user-1",
      },
    });
    ws.emitMessage({
      type: "runtime_hello",
      instanceId: "bridge-owned",
      hostingMode: "local",
      supportedTools: ["codex"],
      registeredRepoIds: [],
    });
    await vi.waitFor(() => {
      expect(mocks.registerRuntime).toHaveBeenCalled();
    });

    ws.emitMessage({ type: "repo_linked", repoId: { id: "repo-1" } });
    await Promise.resolve();

    expect(mocks.addRegisteredRepo).not.toHaveBeenCalled();
    expect(mocks.addRegisteredRepoToLocalRuntime).not.toHaveBeenCalled();
  });

  it("registers antigravity as a supported local bridge tool", async () => {
    const ws = createMockWs();
    mocks.registerLocalRuntimeConnection.mockResolvedValueOnce({
      id: "bridge-owned",
      label: "Laptop",
      organizationId: "org-1",
      ownerUserId: "user-1",
    });

    handleBridgeConnection(ws as never, {
      bridgeAuth: {
        kind: "local",
        instanceId: "bridge-owned",
        organizationId: "org-1",
        userId: "user-1",
      },
    });
    ws.emitMessage({
      type: "runtime_hello",
      instanceId: "bridge-owned",
      hostingMode: "local",
      supportedTools: ["antigravity"],
      registeredRepoIds: [],
    });

    await vi.waitFor(() => {
      expect(mocks.registerRuntime).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "bridge-owned",
          supportedTools: ["antigravity"],
        }),
      );
    });
    expect(ws.close).not.toHaveBeenCalled();
  });

  it("restores only active terminals that include an owner", async () => {
    const ws = createMockWs();
    mocks.registerLocalRuntimeConnection.mockResolvedValueOnce({
      id: "bridge-owned",
      label: "Laptop",
      organizationId: "org-1",
      ownerUserId: "user-1",
    });

    handleBridgeConnection(ws as never, {
      bridgeAuth: {
        kind: "local",
        instanceId: "bridge-owned",
        organizationId: "org-1",
        userId: "user-1",
      },
    });
    ws.emitMessage({
      type: "runtime_hello",
      instanceId: "bridge-owned",
      hostingMode: "local",
      supportedTools: ["codex"],
      registeredRepoIds: [],
      activeTerminals: [
        { terminalId: "term-1", sessionId: "session-1", ownerUserId: "user-1" },
        { terminalId: "term-ownerless", sessionId: "session-1" },
      ],
    });

    await vi.waitFor(() => {
      expect(mocks.restoreTerminals).toHaveBeenCalledWith("org-1:bridge-owned", [
        { terminalId: "term-1", sessionId: "session-1", ownerUserId: "user-1" },
      ]);
    });
  });

  it("closes local bridge authorization failures with a policy violation", async () => {
    const ws = createMockWs();
    mocks.registerLocalRuntimeConnection.mockRejectedValueOnce(
      new AuthorizationError("This bridge instance is already registered to another user"),
    );

    handleBridgeConnection(ws as never, {
      bridgeAuth: {
        kind: "local",
        instanceId: "bridge-owned",
        organizationId: "org-1",
        userId: "user-1",
      },
    });
    ws.emitMessage({
      type: "runtime_hello",
      instanceId: "bridge-owned",
      hostingMode: "local",
      registeredRepoIds: [],
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(ws.close).toHaveBeenCalledWith(
      1008,
      "This bridge instance is already registered to another user",
    );
    expect(mocks.registerRuntime).not.toHaveBeenCalled();
  });

  it("rejects a cloud bridge token that announces another runtime instance", async () => {
    const ws = createMockWs();

    handleBridgeConnection(ws as never, {
      bridgeAuth: {
        kind: "cloud",
        instanceId: "runtime_owned",
        organizationId: "org-1",
        userId: "user-1",
      },
    });
    ws.emitMessage({
      type: "runtime_hello",
      instanceId: "runtime_victim",
      hostingMode: "cloud",
    });
    await Promise.resolve();

    expect(ws.close).toHaveBeenCalledWith(1008, "Bridge auth mismatch");
    expect(mocks.registerRuntime).not.toHaveBeenCalled();
  });

  it("registers a cloud bridge only for the token-bound runtime instance", async () => {
    const ws = createMockWs();

    handleBridgeConnection(ws as never, {
      bridgeAuth: {
        kind: "cloud",
        instanceId: "runtime_owned",
        organizationId: "org-1",
        userId: "user-1",
      },
    });
    ws.emitMessage({
      type: "runtime_hello",
      instanceId: "runtime_owned",
      label: "owned cloud",
      hostingMode: "cloud",
      protocolVersion: 2,
      agentVersion: "0.1.0",
      supportedTools: ["codex"],
      registeredRepoIds: [],
    });
    await Promise.resolve();

    expect(mocks.registerRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "runtime_owned",
        label: "owned cloud",
        hostingMode: "cloud",
        organizationId: "org-1",
        ownerUserId: "user-1",
        supportedTools: ["codex"],
        registeredRepoIds: [],
      }),
    );
    expect(ws.close).not.toHaveBeenCalledWith(1008, "Bridge auth mismatch");
  });

  it("rejects a provisioned cloud bridge with incompatible protocol metadata", async () => {
    const ws = createMockWs();

    handleBridgeConnection(ws as never, {
      bridgeAuth: {
        kind: "cloud",
        instanceId: "runtime_owned",
        organizationId: "org-1",
        userId: "user-1",
        sessionId: "session-1",
        environmentId: "env-1",
        allowedScope: "session",
        tool: "codex",
      },
    });
    ws.emitMessage({
      type: "runtime_hello",
      instanceId: "runtime_owned",
      hostingMode: "cloud",
      protocolVersion: 0,
      agentVersion: "0.1.0",
      supportedTools: ["codex"],
      registeredRepoIds: [],
    });
    await Promise.resolve();

    expect(ws.close).toHaveBeenCalledWith(1008, "Incompatible bridge protocol");
    expect(mocks.registerRuntime).not.toHaveBeenCalled();
  });

  it("rejects a provisioned cloud bridge missing the requested tool", async () => {
    const ws = createMockWs();

    handleBridgeConnection(ws as never, {
      bridgeAuth: {
        kind: "cloud",
        instanceId: "runtime_owned",
        organizationId: "org-1",
        userId: "user-1",
        sessionId: "session-1",
        environmentId: "env-1",
        allowedScope: "session",
        tool: "codex",
      },
    });
    ws.emitMessage({
      type: "runtime_hello",
      instanceId: "runtime_owned",
      hostingMode: "cloud",
      protocolVersion: 2,
      agentVersion: "0.1.0",
      supportedTools: ["claude_code"],
      registeredRepoIds: [],
    });
    await Promise.resolve();

    expect(ws.close).toHaveBeenCalledWith(1008, "Runtime does not support requested tool");
    expect(mocks.registerRuntime).not.toHaveBeenCalled();
  });

  it("binds the scoped session when a provisioned cloud bridge registers", async () => {
    const ws = createMockWs();
    mocks.sessionFindFirst.mockResolvedValue({
      id: "session-1",
      connection: { state: "connecting", runtimeInstanceId: "runtime_owned" },
    });

    handleBridgeConnection(ws as never, {
      bridgeAuth: {
        kind: "cloud",
        instanceId: "runtime_owned",
        organizationId: "org-1",
        userId: "user-1",
        sessionId: "session-1",
        environmentId: "env-1",
        allowedScope: "session",
        tool: "codex",
      },
    });
    ws.emitMessage({
      type: "runtime_hello",
      instanceId: "runtime_owned",
      hostingMode: "cloud",
      protocolVersion: 2,
      agentVersion: "0.1.0",
      supportedTools: ["codex"],
      registeredRepoIds: [],
    });
    await Promise.resolve();

    expect(mocks.bindSession).toHaveBeenCalledWith("session-1", "runtime_owned");
    expect(mocks.registerRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "runtime_owned",
        hostingMode: "cloud",
        supportedTools: ["codex"],
        registeredRepoIds: [],
      }),
    );
  });

  it("binds a scoped provisioned bridge before lifecycle state records the runtime id", async () => {
    const ws = createMockWs();
    mocks.sessionFindFirst.mockResolvedValue({
      id: "session-1",
      connection: { state: "requested" },
    });

    handleBridgeConnection(ws as never, {
      bridgeAuth: {
        kind: "cloud",
        instanceId: "runtime_owned",
        organizationId: "org-1",
        userId: "user-1",
        sessionId: "session-1",
        environmentId: "env-1",
        allowedScope: "session",
        tool: "codex",
      },
    });
    ws.emitMessage({
      type: "runtime_hello",
      instanceId: "runtime_owned",
      hostingMode: "cloud",
      protocolVersion: 2,
      agentVersion: "0.1.0",
      supportedTools: ["codex"],
      registeredRepoIds: [],
    });
    await Promise.resolve();

    expect(mocks.bindSession).toHaveBeenCalledWith("session-1", "runtime_owned");
    expect(ws.close).not.toHaveBeenCalledWith(1008, "Session is not waiting for this runtime");
  });

  it("rejects a scoped provisioned bridge bound to a different runtime id", async () => {
    const ws = createMockWs();
    mocks.sessionFindFirst.mockResolvedValue({
      id: "session-1",
      connection: { state: "connecting", runtimeInstanceId: "other-runtime" },
    });

    handleBridgeConnection(ws as never, {
      bridgeAuth: {
        kind: "cloud",
        instanceId: "runtime_owned",
        organizationId: "org-1",
        userId: "user-1",
        sessionId: "session-1",
        environmentId: "env-1",
        allowedScope: "session",
        tool: "codex",
      },
    });
    ws.emitMessage({
      type: "runtime_hello",
      instanceId: "runtime_owned",
      hostingMode: "cloud",
      protocolVersion: 2,
      agentVersion: "0.1.0",
      supportedTools: ["codex"],
      registeredRepoIds: [],
    });
    await Promise.resolve();

    expect(ws.close).toHaveBeenCalledWith(1008, "Session is not waiting for this runtime");
    expect(mocks.bindSession).not.toHaveBeenCalled();
  });

  it("reclaims a scoped cloud bridge whose own runtime connects after a startup timeout", async () => {
    const ws = createMockWs();
    mocks.sessionFindFirst.mockResolvedValue({
      id: "session-1",
      connection: { state: "timed_out", runtimeInstanceId: "runtime_owned" },
    });

    handleBridgeConnection(ws as never, {
      bridgeAuth: {
        kind: "cloud",
        instanceId: "runtime_owned",
        organizationId: "org-1",
        userId: "user-1",
        sessionId: "session-1",
        environmentId: "env-1",
        allowedScope: "session",
        tool: "codex",
      },
    });
    ws.emitMessage({
      type: "runtime_hello",
      instanceId: "runtime_owned",
      hostingMode: "cloud",
      protocolVersion: 2,
      agentVersion: "0.1.0",
      supportedTools: ["codex"],
      registeredRepoIds: [],
    });
    await Promise.resolve();

    // The session's own runtime showing up late must reclaim, not be rejected —
    // otherwise the timed-out session can never recover.
    expect(mocks.bindSession).toHaveBeenCalledWith("session-1", "runtime_owned");
    expect(ws.close).not.toHaveBeenCalledWith(1008, "Session is not waiting for this runtime");
  });

  it("still rejects a scoped cloud bridge whose runtime differs after a startup timeout", async () => {
    const ws = createMockWs();
    mocks.sessionFindFirst.mockResolvedValue({
      id: "session-1",
      connection: { state: "timed_out", runtimeInstanceId: "other-runtime" },
    });

    handleBridgeConnection(ws as never, {
      bridgeAuth: {
        kind: "cloud",
        instanceId: "runtime_owned",
        organizationId: "org-1",
        userId: "user-1",
        sessionId: "session-1",
        environmentId: "env-1",
        allowedScope: "session",
        tool: "codex",
      },
    });
    ws.emitMessage({
      type: "runtime_hello",
      instanceId: "runtime_owned",
      hostingMode: "cloud",
      protocolVersion: 2,
      agentVersion: "0.1.0",
      supportedTools: ["codex"],
      registeredRepoIds: [],
    });
    await Promise.resolve();

    expect(ws.close).toHaveBeenCalledWith(1008, "Session is not waiting for this runtime");
    expect(mocks.bindSession).not.toHaveBeenCalled();
  });

  it("ignores session output for sessions not bound to this bridge runtime", async () => {
    const ws = createMockWs();
    mocks.getRuntimeForSession.mockReturnValue({
      id: "runtime_other",
      ws: createMockWs(),
    });

    handleBridgeConnection(ws as never, {
      bridgeAuth: {
        kind: "cloud",
        instanceId: "runtime_owned",
        organizationId: "org-1",
        userId: "user-1",
      },
    });
    ws.emitMessage({
      type: "runtime_hello",
      instanceId: "runtime_owned",
      hostingMode: "cloud",
    });
    await Promise.resolve();
    ws.emitMessage({
      type: "session_output",
      sessionId: "victim-session",
      data: { type: "assistant", message: "spoofed" },
    });
    await Promise.resolve();

    expect(mocks.recordOutput).not.toHaveBeenCalled();
  });

  it("accepts session output when persisted session ownership matches this runtime", async () => {
    const ws = createMockWs();
    mocks.sessionFindFirst.mockResolvedValue({
      id: "session-1",
      connection: { state: "connected", runtimeInstanceId: "runtime_owned" },
    });

    handleBridgeConnection(ws as never, {
      bridgeAuth: {
        kind: "cloud",
        instanceId: "runtime_owned",
        organizationId: "org-1",
        userId: "user-1",
      },
    });
    ws.emitMessage({
      type: "runtime_hello",
      instanceId: "runtime_owned",
      hostingMode: "cloud",
    });
    await Promise.resolve();
    ws.emitMessage({
      type: "session_output",
      sessionId: "session-1",
      data: { type: "assistant", message: "owned" },
    });

    await vi.waitFor(() => {
      expect(mocks.recordOutput).toHaveBeenCalledWith("session-1", {
        type: "assistant",
        message: "owned",
      });
    });
    expect(mocks.registerRuntime).toHaveBeenCalled();
  });

  it("processes reconnect-flushed session output after local runtime registration", async () => {
    const ws = createMockWs();
    let releaseRegistration: () => void = () => {};
    const registration = new Promise<{
      id: string;
      label: string;
      organizationId: string;
      ownerUserId: string;
    }>((resolve) => {
      releaseRegistration = () => {
        resolve({
          id: "bridge-runtime-1",
          label: "Bridge",
          organizationId: "org-1",
          ownerUserId: "user-1",
        });
      };
    });
    mocks.registerLocalRuntimeConnection.mockReturnValueOnce(registration);
    mocks.sessionFindFirst.mockResolvedValue({
      id: "session-1",
      connection: { state: "connected", runtimeInstanceId: "bridge-owned" },
    });

    handleBridgeConnection(ws as never, {
      bridgeAuth: {
        kind: "local",
        instanceId: "bridge-owned",
        organizationId: "org-1",
        userId: "user-1",
      },
    });
    ws.emitMessage({
      type: "runtime_hello",
      instanceId: "bridge-owned",
      label: "Bridge",
      hostingMode: "local",
      supportedTools: ["codex"],
      registeredRepoIds: [],
    });
    ws.emitMessage({
      type: "session_output",
      sessionId: "session-1",
      data: { type: "assistant", message: "queued during reconnect" },
    });

    await Promise.resolve();
    expect(mocks.recordOutput).not.toHaveBeenCalled();

    releaseRegistration();

    await vi.waitFor(() => {
      expect(mocks.registerRuntime).toHaveBeenCalledWith(
        expect.objectContaining({
          key: "org-1:bridge-owned",
          id: "bridge-owned",
          hostingMode: "local",
        }),
      );
      expect(mocks.recordOutput).toHaveBeenCalledWith("session-1", {
        type: "assistant",
        message: "queued during reconnect",
      });
    });
  });

  it("reconciles active run state from runtime heartbeats", async () => {
    const ws = createMockWs();
    mocks.registerLocalRuntimeConnection.mockResolvedValue({
      id: "bridge-runtime-1",
      label: "Bridge",
      organizationId: "org-1",
      ownerUserId: "user-1",
    });
    mocks.getHeartbeatReconcileSessionIds.mockReturnValue(["session-1", "session-2"]);

    handleBridgeConnection(ws as never, {
      bridgeAuth: {
        kind: "local",
        instanceId: "bridge-owned",
        organizationId: "org-1",
        userId: "user-1",
      },
    });
    ws.emitMessage({
      type: "runtime_hello",
      instanceId: "bridge-owned",
      label: "Bridge",
      hostingMode: "local",
      supportedTools: ["claude_code"],
      registeredRepoIds: [],
    });

    await vi.waitFor(() => {
      expect(mocks.registerRuntime).toHaveBeenCalled();
    });

    ws.emitMessage({
      type: "runtime_heartbeat",
      instanceId: "bridge-owned",
      activeSessionIds: ["session-2"],
    });

    expect(mocks.recordHeartbeat).toHaveBeenCalledWith("org-1:bridge-owned", ws);
    expect(mocks.listIdleActiveRunSessionIds).toHaveBeenCalledWith({
      sessionIds: ["session-1", "session-2"],
      activeSessionIds: ["session-2"],
    });
  });

  it("does not reconcile restored sessions that have not received a command on this connection", async () => {
    const ws = createMockWs();
    mocks.registerLocalRuntimeConnection.mockResolvedValue({
      id: "bridge-runtime-1",
      label: "Bridge",
      organizationId: "org-1",
      ownerUserId: "user-1",
    });
    mocks.getBoundSessionIds.mockReturnValue(["session-1"]);
    mocks.getHeartbeatReconcileSessionIds.mockReturnValue([]);

    handleBridgeConnection(ws as never, {
      bridgeAuth: {
        kind: "local",
        instanceId: "bridge-owned",
        organizationId: "org-1",
        userId: "user-1",
      },
    });
    ws.emitMessage({
      type: "runtime_hello",
      instanceId: "bridge-owned",
      label: "Bridge",
      hostingMode: "local",
      supportedTools: ["claude_code"],
      registeredRepoIds: [],
    });

    await vi.waitFor(() => {
      expect(mocks.registerRuntime).toHaveBeenCalled();
    });

    ws.emitMessage({
      type: "runtime_heartbeat",
      instanceId: "bridge-owned",
      activeSessionIds: [],
    });

    expect(mocks.recordHeartbeat).toHaveBeenCalledWith("org-1:bridge-owned", ws);
    expect(mocks.listIdleActiveRunSessionIds).not.toHaveBeenCalled();
  });

  it("does not reconcile active runs from a stale websocket heartbeat", async () => {
    const ws = createMockWs();
    mocks.registerLocalRuntimeConnection.mockResolvedValue({
      id: "bridge-runtime-1",
      label: "Bridge",
      organizationId: "org-1",
      ownerUserId: "user-1",
    });
    mocks.recordHeartbeat.mockReturnValueOnce(false);
    mocks.getHeartbeatReconcileSessionIds.mockReturnValue(["session-1"]);

    handleBridgeConnection(ws as never, {
      bridgeAuth: {
        kind: "local",
        instanceId: "bridge-owned",
        organizationId: "org-1",
        userId: "user-1",
      },
    });
    ws.emitMessage({
      type: "runtime_hello",
      instanceId: "bridge-owned",
      label: "Bridge",
      hostingMode: "local",
      supportedTools: ["claude_code"],
      registeredRepoIds: [],
    });

    await vi.waitFor(() => {
      expect(mocks.registerRuntime).toHaveBeenCalled();
    });

    ws.emitMessage({
      type: "runtime_heartbeat",
      instanceId: "bridge-owned",
      activeSessionIds: [],
    });

    expect(mocks.recordHeartbeat).toHaveBeenCalledWith("org-1:bridge-owned", ws);
    expect(mocks.listIdleActiveRunSessionIds).not.toHaveBeenCalled();
  });

  it("enqueues recovered completions behind prior session output", async () => {
    const ws = createMockWs();
    let releaseOutput: () => void = () => {};
    const outputPromise = new Promise<void>((resolve) => {
      releaseOutput = resolve;
    });

    mocks.registerLocalRuntimeConnection.mockResolvedValue({
      id: "bridge-runtime-1",
      label: "Bridge",
      organizationId: "org-1",
      ownerUserId: "user-1",
    });
    mocks.getHeartbeatReconcileSessionIds.mockReturnValue(["session-1"]);
    mocks.listIdleActiveRunSessionIds.mockResolvedValue(["session-1"]);
    mocks.recordOutput.mockReturnValueOnce(outputPromise);

    handleBridgeConnection(ws as never, {
      bridgeAuth: {
        kind: "local",
        instanceId: "bridge-owned",
        organizationId: "org-1",
        userId: "user-1",
      },
    });
    ws.emitMessage({
      type: "runtime_hello",
      instanceId: "bridge-owned",
      label: "Bridge",
      hostingMode: "local",
      supportedTools: ["claude_code"],
      registeredRepoIds: [],
    });

    await vi.waitFor(() => {
      expect(mocks.registerRuntime).toHaveBeenCalled();
    });

    mocks.getRuntimeForSession.mockReturnValue({
      key: "org-1:bridge-owned",
      id: "bridge-owned",
      ws,
      organizationId: "org-1",
    });

    ws.emitMessage({
      type: "session_output",
      sessionId: "session-1",
      data: { type: "assistant", message: "final" },
    });

    await vi.waitFor(() => {
      expect(mocks.recordOutput).toHaveBeenCalledWith("session-1", {
        type: "assistant",
        message: "final",
      });
    });

    ws.emitMessage({
      type: "runtime_heartbeat",
      instanceId: "bridge-owned",
      activeSessionIds: [],
    });

    await vi.waitFor(() => {
      expect(mocks.listIdleActiveRunSessionIds).toHaveBeenCalled();
    });
    await Promise.resolve();
    expect(mocks.complete).not.toHaveBeenCalled();

    releaseOutput();

    await vi.waitFor(() => {
      expect(mocks.complete).toHaveBeenCalledWith("session-1");
    });
  });

  it("relays provisioned terminal output and exit by terminalId from the source runtime", async () => {
    const ws = createMockWs();
    mocks.sessionFindFirst.mockResolvedValue({
      id: "session-1",
      connection: { state: "connecting", runtimeInstanceId: "runtime_owned" },
    });

    handleBridgeConnection(ws as never, {
      bridgeAuth: {
        kind: "cloud",
        instanceId: "runtime_owned",
        organizationId: "org-1",
        userId: "user-1",
        sessionId: "session-1",
        environmentId: "env-1",
        allowedScope: "session",
        tool: "codex",
      },
    });
    ws.emitMessage({
      type: "runtime_hello",
      instanceId: "runtime_owned",
      hostingMode: "cloud",
      protocolVersion: 2,
      agentVersion: "0.1.0",
      supportedTools: ["codex"],
      registeredRepoIds: [],
    });
    await vi.waitFor(() => {
      expect(mocks.registerRuntime).toHaveBeenCalled();
    });

    ws.emitMessage({
      type: "terminal_output",
      terminalId: "term-1",
      data: "one",
    });
    ws.emitMessage({
      type: "terminal_output",
      terminalId: "term-2",
      data: "two",
    });
    ws.emitMessage({
      type: "terminal_exit",
      terminalId: "term-1",
      exitCode: 0,
    });
    await vi.waitFor(() => {
      expect(mocks.relayFromBridge).toHaveBeenCalledWith(
        expect.objectContaining({ type: "terminal_output", terminalId: "term-1", data: "one" }),
        "runtime_owned",
      );
      expect(mocks.relayFromBridge).toHaveBeenCalledWith(
        expect.objectContaining({ type: "terminal_output", terminalId: "term-2", data: "two" }),
        "runtime_owned",
      );
      expect(mocks.relayFromBridge).toHaveBeenCalledWith(
        expect.objectContaining({ type: "terminal_exit", terminalId: "term-1", exitCode: 0 }),
        "runtime_owned",
      );
    });
  });

  it("forwards local session_pr_status observations to the session service", async () => {
    const ws = createMockWs();
    mocks.registerLocalRuntimeConnection.mockResolvedValueOnce({
      id: "bridge-runtime-1",
      label: "Home runtime",
      organizationId: "org-1",
      ownerUserId: "user-1",
    });

    handleBridgeConnection(ws as never, {
      bridgeAuth: {
        kind: "local",
        userId: "user-1",
        organizationId: "org-1",
        instanceId: "runtime-home",
      },
    });
    ws.emitMessage({
      type: "runtime_hello",
      instanceId: "runtime-home",
      label: "Home runtime",
      hostingMode: "local",
      supportedTools: ["codex"],
      registeredRepoIds: [],
    });
    await vi.waitFor(() => {
      expect(mocks.registerRuntime).toHaveBeenCalled();
    });

    ws.emitMessage({
      type: "session_pr_status",
      sessionId: "session-1",
      branch: "trace/branch",
      observedAt: "2026-05-01T00:00:00.000Z",
      pr: {
        url: "https://github.com/trace/trace/pull/100",
        state: "OPEN",
        merged: false,
      },
    });

    await vi.waitFor(() => {
      expect(mocks.syncPrObservation).toHaveBeenCalledWith({
        sessionId: "session-1",
        runtimeInstanceId: "runtime-home",
        organizationId: "org-1",
        ownerUserId: "user-1",
        branch: "trace/branch",
        observedAt: "2026-05-01T00:00:00.000Z",
        pr: {
          url: "https://github.com/trace/trace/pull/100",
          state: "OPEN",
          merged: false,
        },
        error: null,
        actorId: "github-bridge-poll",
      });
    });
  });

  it("ignores session_pr_status from non-local bridges", async () => {
    const ws = createMockWs();

    handleBridgeConnection(ws as never, {
      bridgeAuth: {
        kind: "cloud",
        instanceId: "runtime_owned",
        organizationId: "org-1",
        userId: "user-1",
      },
    });
    ws.emitMessage({
      type: "session_pr_status",
      sessionId: "session-1",
      branch: "trace/branch",
      observedAt: "2026-05-01T00:00:00.000Z",
      pr: null,
    });
    await Promise.resolve();

    expect(mocks.syncPrObservation).not.toHaveBeenCalled();
  });
});
