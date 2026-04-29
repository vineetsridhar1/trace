import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  registerRuntime: vi.fn(),
  unregisterRuntime: vi.fn(),
  bindSession: vi.fn(),
  getRuntime: vi.fn(() => undefined),
  getRuntimeForSession: vi.fn(() => undefined),
  getLinkedCheckoutStatus: vi.fn(() => Promise.resolve()),
  restoreSessionsForRuntime: vi.fn(() => Promise.resolve()),
  recordOutput: vi.fn(() => Promise.resolve()),
  registerLocalRuntimeConnection: vi.fn(),
  restoreTerminals: vi.fn(() => Promise.resolve()),
  sessionFindFirst: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("./session-router.js", () => ({
  sessionRouter: {
    registerRuntime: mocks.registerRuntime,
    unregisterRuntime: mocks.unregisterRuntime,
    bindSession: mocks.bindSession,
    getRuntime: mocks.getRuntime,
    getRuntimeForSession: mocks.getRuntimeForSession,
    getLinkedCheckoutStatus: mocks.getLinkedCheckoutStatus,
  },
}));

vi.mock("../services/session.js", () => ({
  sessionService: {
    restoreSessionsForRuntime: mocks.restoreSessionsForRuntime,
    recordOutput: mocks.recordOutput,
  },
}));

vi.mock("./runtime-debug.js", () => ({
  runtimeDebug: vi.fn(),
}));

vi.mock("./terminal-relay.js", () => ({
  terminalRelay: {
    restoreTerminals: mocks.restoreTerminals,
    relayFromBridge: vi.fn(),
  },
}));

vi.mock("../services/runtime-access.js", () => ({
  runtimeAccessService: {
    registerLocalRuntimeConnection: mocks.registerLocalRuntimeConnection,
    markRuntimeDisconnected: vi.fn(() => Promise.resolve()),
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

  it("rejects a cloud bridge token that announces another runtime instance", async () => {
    const ws = createMockWs();

    handleBridgeConnection(ws as never, {
      bridgeAuth: {
        kind: "cloud",
        instanceId: "cloud-machine-owned",
        organizationId: "org-1",
        userId: "user-1",
      },
    });
    ws.emitMessage({
      type: "runtime_hello",
      instanceId: "cloud-machine-victim",
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
        instanceId: "cloud-machine-owned",
        organizationId: "org-1",
        userId: "user-1",
      },
    });
    ws.emitMessage({
      type: "runtime_hello",
      instanceId: "cloud-machine-owned",
      label: "owned cloud",
      hostingMode: "cloud",
      protocolVersion: 1,
      agentVersion: "0.1.0",
      supportedTools: ["codex"],
      registeredRepoIds: [],
    });
    await Promise.resolve();

    expect(mocks.registerRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "cloud-machine-owned",
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
        instanceId: "cloud-machine-owned",
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
      instanceId: "cloud-machine-owned",
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
        instanceId: "cloud-machine-owned",
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
      instanceId: "cloud-machine-owned",
      hostingMode: "cloud",
      protocolVersion: 1,
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
      connection: { state: "connecting", runtimeInstanceId: "cloud-machine-owned" },
    });

    handleBridgeConnection(ws as never, {
      bridgeAuth: {
        kind: "cloud",
        instanceId: "cloud-machine-owned",
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
      instanceId: "cloud-machine-owned",
      hostingMode: "cloud",
      protocolVersion: 1,
      agentVersion: "0.1.0",
      supportedTools: ["codex"],
      registeredRepoIds: [],
    });
    await Promise.resolve();

    expect(mocks.bindSession).toHaveBeenCalledWith("session-1", "cloud-machine-owned");
    expect(mocks.registerRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "cloud-machine-owned",
        hostingMode: "cloud",
        supportedTools: ["codex"],
        registeredRepoIds: [],
      }),
    );
  });

  it("rejects a scoped cloud bridge after startup timeout", async () => {
    const ws = createMockWs();
    mocks.sessionFindFirst.mockResolvedValue({
      id: "session-1",
      connection: { state: "timed_out", runtimeInstanceId: "cloud-machine-owned" },
    });

    handleBridgeConnection(ws as never, {
      bridgeAuth: {
        kind: "cloud",
        instanceId: "cloud-machine-owned",
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
      instanceId: "cloud-machine-owned",
      hostingMode: "cloud",
      protocolVersion: 1,
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
      id: "cloud-machine-other",
      ws: createMockWs(),
    });

    handleBridgeConnection(ws as never, {
      bridgeAuth: {
        kind: "cloud",
        instanceId: "cloud-machine-owned",
        organizationId: "org-1",
        userId: "user-1",
      },
    });
    ws.emitMessage({
      type: "runtime_hello",
      instanceId: "cloud-machine-owned",
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
      connection: { state: "connected", runtimeInstanceId: "cloud-machine-owned" },
    });

    handleBridgeConnection(ws as never, {
      bridgeAuth: {
        kind: "cloud",
        instanceId: "cloud-machine-owned",
        organizationId: "org-1",
        userId: "user-1",
      },
    });
    ws.emitMessage({
      type: "runtime_hello",
      instanceId: "cloud-machine-owned",
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
});
