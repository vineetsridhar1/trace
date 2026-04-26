import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateAccessToken: vi.fn(),
  isExternalLocalModeRequest: vi.fn(() => false),
  parseCookieToken: vi.fn(),
  getTerminalAuthContext: vi.fn(() => null),
  detachAllForFrontend: vi.fn(),
}));

vi.mock("./auth.js", () => ({
  authenticateAccessToken: mocks.authenticateAccessToken,
  isExternalLocalModeRequest: mocks.isExternalLocalModeRequest,
  parseCookieToken: mocks.parseCookieToken,
}));

vi.mock("./terminal-relay.js", () => ({
  terminalRelay: {
    getTerminalAuthContext: mocks.getTerminalAuthContext,
    detachAllForFrontend: mocks.detachAllForFrontend,
  },
}));

vi.mock("./db.js", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("../services/runtime-access.js", () => ({
  runtimeAccessService: {
    assertAccess: vi.fn(),
  },
}));

import { handleTerminalConnection } from "./terminal-handler.js";

type MessageHandler = (payload: Buffer | string) => void;

function createMockWs() {
  const handlers = new Map<string, (...args: unknown[]) => void>();
  return {
    send: vi.fn(),
    close: vi.fn(),
    ping: vi.fn(),
    terminate: vi.fn(),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers.set(event, handler);
    }),
    emitMessage(payload: unknown) {
      const handler = handlers.get("message") as MessageHandler | undefined;
      handler?.(JSON.stringify(payload));
    },
  };
}

describe("terminal handler auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.parseCookieToken.mockReturnValue(undefined);
    mocks.authenticateAccessToken.mockResolvedValue({ kind: "session", userId: "user-1" });
  });

  it("authenticates browser terminal sockets from the session cookie", async () => {
    mocks.parseCookieToken.mockReturnValue("cookie-token");
    const ws = createMockWs();

    handleTerminalConnection(ws as never, {
      headers: { cookie: "trace_token=cookie-token" },
      url: "/terminal",
      socket: { remoteAddress: "127.0.0.1" },
    });

    await Promise.resolve();

    expect(mocks.parseCookieToken).toHaveBeenCalledWith("trace_token=cookie-token");
    expect(mocks.authenticateAccessToken).toHaveBeenCalledWith("cookie-token");
  });

  it("authenticates mobile terminal sockets from the bearer-style query token", async () => {
    const ws = createMockWs();

    handleTerminalConnection(ws as never, {
      headers: {},
      url: "/terminal?token=mobile-token",
      socket: { remoteAddress: "127.0.0.1" },
    });

    await Promise.resolve();

    expect(mocks.authenticateAccessToken).toHaveBeenCalledWith("mobile-token");
    expect(mocks.parseCookieToken).not.toHaveBeenCalled();
  });
});
