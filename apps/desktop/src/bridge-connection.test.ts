import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("ws", async () => {
  const { EventEmitter: MockEventEmitter } = await import("node:events");

  class MockWebSocket extends MockEventEmitter {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly instances: MockWebSocket[] = [];

    readyState = MockWebSocket.CONNECTING;
    closeCalls = 0;

    constructor(_url: string, _options?: unknown) {
      super();
      MockWebSocket.instances.push(this);
    }

    close(): void {
      this.closeCalls += 1;
    }

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
  getRepoConfig: () => null,
  readConfig: () => ({ repos: {}, bridgeLabel: null }),
}));

vi.mock("./runtime-debug.js", () => ({
  runtimeDebug: vi.fn(),
}));

import WebSocket from "ws";
import { BridgeClient, type BridgeConnectionStatus } from "./bridge.js";

type MockSocket = EventEmitter & {
  readyState: number;
  closeCalls: number;
};

type MockWebSocketConstructor = {
  readonly CONNECTING: number;
  readonly OPEN: number;
  readonly instances: MockSocket[];
};

type BridgeClientInternals = {
  ws: MockSocket | null;
  openSocket: (attempt: number) => Promise<void>;
  connect: ReturnType<typeof vi.fn>;
  scheduleReconnect: ReturnType<typeof vi.fn>;
  status: BridgeConnectionStatus;
};

const MockWebSocket = WebSocket as unknown as MockWebSocketConstructor;

function createBridgeClient(): { client: BridgeClient; internals: BridgeClientInternals } {
  const client = Object.create(BridgeClient.prototype) as BridgeClient;
  const internals = client as unknown as BridgeClientInternals;

  Object.assign(client as unknown as Record<string, unknown>, {
    ws: null,
    serverUrl: "http://localhost:4000",
    instanceId: "bridge-test",
    authContext: { organizationId: "org-test" },
    connectAttempt: 1,
    status: "connected",
    statusListeners: new Set(),
    heartbeatTimer: null,
    hookQueueTimer: null,
    localPrPollTimer: null,
    reconnectTimer: null,
    autoSyncManager: { stop: vi.fn() },
    fetchBridgeAuthToken: vi.fn().mockResolvedValue("bridge-token"),
    connect: vi.fn(),
    scheduleReconnect: vi.fn(),
  });

  return { client, internals };
}

beforeEach(() => {
  MockWebSocket.instances.length = 0;
});

describe("BridgeClient WebSocket lifecycle", () => {
  it.each([
    ["connecting", MockWebSocket.CONNECTING],
    ["open", MockWebSocket.OPEN],
  ])("safely retires a %s socket during a forced reconnect", async (_label, readyState) => {
    const { client, internals } = createBridgeClient();
    await internals.openSocket(1);
    const socket = MockWebSocket.instances[0];
    socket.readyState = readyState;

    client.forceReconnect();

    expect(internals.ws).toBeNull();
    expect(socket.closeCalls).toBe(1);
    expect(socket.listenerCount("error")).toBe(1);
    expect(socket.listenerCount("close")).toBe(1);
    expect(() =>
      socket.emit("error", new Error("WebSocket was closed before the connection was established")),
    ).not.toThrow();
    socket.emit("close", 1006, Buffer.alloc(0));
    expect(internals.scheduleReconnect).not.toHaveBeenCalled();
    expect(internals.connect).toHaveBeenCalledOnce();
  });

  it("reconnects when the active socket closes normally", async () => {
    const { internals } = createBridgeClient();
    await internals.openSocket(1);
    const socket = MockWebSocket.instances[0];

    socket.emit("close", 1006, Buffer.alloc(0));

    expect(internals.ws).toBeNull();
    expect(internals.status).toBe("disconnected");
    expect(internals.scheduleReconnect).toHaveBeenCalledWith(3000);
  });
});
