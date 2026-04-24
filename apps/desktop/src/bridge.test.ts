import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { MockAutoSyncManager, MockTerminalManager, MockWebSocket } = vi.hoisted(() => {
  class HoistedMockWebSocket {
    static readonly OPEN = 1;
    static readonly CLOSED = 3;
    static instances: HoistedMockWebSocket[] = [];

    readyState = 0;
    send = vi.fn();
    close = vi.fn(() => {
      this.readyState = HoistedMockWebSocket.CLOSED;
      this.emit("close");
    });
    removeAllListeners = vi.fn((event?: "open" | "message" | "close" | "error") => {
      if (event) {
        this.listeners[event] = [];
        return this;
      }

      this.listeners = {
        open: [],
        message: [],
        close: [],
        error: [],
      };
      return this;
    });

    private listeners: {
      open: Array<() => void>;
      message: Array<(data: Buffer) => void>;
      close: Array<() => void>;
      error: Array<(error: Error) => void>;
    } = {
      open: [],
      message: [],
      close: [],
      error: [],
    };

    constructor(public readonly url: string) {
      HoistedMockWebSocket.instances.push(this);
    }

    on(event: "open", listener: () => void): this;
    on(event: "message", listener: (data: Buffer) => void): this;
    on(event: "close", listener: () => void): this;
    on(event: "error", listener: (error: Error) => void): this;
    on(
      event: "open" | "message" | "close" | "error",
      listener:
        | (() => void)
        | ((data: Buffer) => void)
        | ((error: Error) => void),
    ): this {
      if (event === "open" || event === "close") {
        this.listeners[event].push(listener as () => void);
        return this;
      }

      if (event === "message") {
        this.listeners.message.push(listener as (data: Buffer) => void);
        return this;
      }

      this.listeners.error.push(listener as (error: Error) => void);
      return this;
    }

    emit(event: "open"): void;
    emit(event: "message", data: Buffer): void;
    emit(event: "close"): void;
    emit(event: "error", error: Error): void;
    emit(event: "open" | "message" | "close" | "error", payload?: Buffer | Error): void {
      if (event === "open") {
        this.readyState = HoistedMockWebSocket.OPEN;
        for (const listener of this.listeners.open) listener();
        return;
      }

      if (event === "message") {
        for (const listener of this.listeners.message) listener(payload as Buffer);
        return;
      }

      if (event === "close") {
        for (const listener of this.listeners.close) listener();
        return;
      }

      for (const listener of this.listeners.error) listener(payload as Error);
    }
  }

  class HoistedMockTerminalManager {
    destroyAll = vi.fn();

    getActiveTerminals(): Array<{ terminalId: string; sessionId: string }> {
      return [];
    }
  }

  class HoistedMockAutoSyncManager {
    start = vi.fn();
    stop = vi.fn();
  }

  return {
    MockAutoSyncManager: HoistedMockAutoSyncManager,
    MockTerminalManager: HoistedMockTerminalManager,
    MockWebSocket: HoistedMockWebSocket,
  };
});

vi.mock("ws", () => ({
  default: MockWebSocket,
}));

vi.mock("@trace/shared", () => ({
  GIT_DIFF_TREE_ARGS: [],
  GIT_SHOW_ARGS: [],
  cleanupTempImages: vi.fn(),
  downloadImagesToTempFiles: vi.fn(async () => []),
  extractGitToolResultTrigger: vi.fn(() => null),
  extractGitToolUsePending: vi.fn(() => null),
  handleBranchDiff: vi.fn(),
  handleFileAtRef: vi.fn(),
  handleListFiles: vi.fn(),
  handleListSkills: vi.fn(),
  handleReadFile: vi.fn(),
  isMissingToolSessionError: vi.fn(() => false),
  parseBranchOutput: vi.fn(),
  parseGitShowOutput: vi.fn(),
}));

vi.mock("./config.js", () => ({
  getOrCreateInstanceId: () => "runtime-1",
  getRepoConfig: vi.fn(() => null),
  readConfig: vi.fn(() => ({ repos: {} })),
}));

vi.mock("./linked-checkout.js", () => ({
  commitLinkedCheckoutChanges: vi.fn(),
  getLinkedCheckoutStatus: vi.fn(),
  linkLinkedCheckoutRepo: vi.fn(),
  restoreLinkedCheckout: vi.fn(),
  setAutoSyncManager: vi.fn(),
  setLinkedCheckoutAutoSync: vi.fn(),
  syncLinkedCheckout: vi.fn(),
}));

vi.mock("./linked-checkout-auto-sync.js", () => ({
  LinkedCheckoutAutoSyncManager: MockAutoSyncManager,
}));

vi.mock("./runtime-debug.js", () => ({
  runtimeDebug: vi.fn(),
}));

vi.mock("./worktree.js", () => ({
  createWorktree: vi.fn(),
  removeWorktree: vi.fn(),
}));

vi.mock("./hook-runtime.js", () => ({
  loadQueuedGitHookCheckpoints: vi.fn(async () => []),
  removeQueuedCheckpointFile: vi.fn(async () => undefined),
  writeCheckpointContext: vi.fn(async () => undefined),
}));

vi.mock("@trace/shared/adapters", () => ({
  ClaudeCodeAdapter: class {
    abort() {}
  },
  CodexAdapter: class {
    abort() {}
  },
  TerminalManager: MockTerminalManager,
}));

import { BridgeClient } from "./bridge.js";

function createSuccessResponse(expiresAt: string): Response {
  return {
    ok: true,
    json: async () => ({
      token: "bridge-token",
      expiresAt,
    }),
  } as Response;
}

function createFailureResponse(status: number, body: string): Response {
  return {
    ok: false,
    status,
    text: async () => body,
  } as Response;
}

async function flushMicrotasks(turns = 6): Promise<void> {
  for (let index = 0; index < turns; index += 1) {
    await Promise.resolve();
  }
}

describe("BridgeClient reconnect retries", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("keeps retrying bridge auth token fetches while auth context is present", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(createFailureResponse(503, "bridge unavailable"));
    vi.stubGlobal("fetch", fetchMock);
    const getSessionCookieHeader = vi.fn(async () => "trace-session=1");
    const bridge = new BridgeClient("http://trace.test", getSessionCookieHeader);

    bridge.setAuthContext("org-1");
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(MockWebSocket.instances).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("keeps reconnecting after repeated websocket closes", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(createSuccessResponse("2099-01-01T00:00:00.000Z"));
    vi.stubGlobal("fetch", fetchMock);
    const getSessionCookieHeader = vi.fn(async () => "trace-session=1");
    const bridge = new BridgeClient("http://trace.test", getSessionCookieHeader);

    bridge.setAuthContext("org-1");
    await flushMicrotasks();

    expect(MockWebSocket.instances).toHaveLength(1);

    MockWebSocket.instances[0]?.emit("close");
    await vi.advanceTimersByTimeAsync(3000);
    expect(MockWebSocket.instances).toHaveLength(2);

    MockWebSocket.instances[1]?.emit("close");
    await vi.advanceTimersByTimeAsync(3000);
    expect(MockWebSocket.instances).toHaveLength(3);
  });
});
