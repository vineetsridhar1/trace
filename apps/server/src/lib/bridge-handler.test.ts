import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  registerRuntime: vi.fn(),
  unregisterRuntime: vi.fn(),
  getRuntime: vi.fn(() => undefined),
  getRuntimeForSession: vi.fn(() => undefined),
  getLinkedCheckoutStatus: vi.fn(() => Promise.resolve()),
  restoreSessionsForRuntime: vi.fn(() => Promise.resolve()),
  recordOutput: vi.fn(() => Promise.resolve()),
  registerLocalRuntimeConnection: vi.fn(),
  restoreTerminals: vi.fn(() => Promise.resolve()),
}));

vi.mock("./session-router.js", () => ({
  sessionRouter: {
    registerRuntime: mocks.registerRuntime,
    unregisterRuntime: mocks.unregisterRuntime,
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
      supportedTools: ["codex"],
      registeredRepoIds: ["repo-1"],
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
        registeredRepoIds: ["repo-1"],
      }),
    );
    expect(ws.close).not.toHaveBeenCalledWith(1008, "Bridge auth mismatch");
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
});
