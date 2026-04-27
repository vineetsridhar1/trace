import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateAccessToken: vi.fn(),
  isExternalLocalModeRequest: vi.fn(() => false),
  parseCookieToken: vi.fn(),
  getTerminalAuthContext: vi.fn(() => null),
  attachFrontend: vi.fn(() => true),
  detachAllForFrontend: vi.fn(),
  relayFromFrontend: vi.fn(),
  assertAccess: vi.fn(),
}));

vi.mock("./auth.js", () => ({
  authenticateAccessToken: mocks.authenticateAccessToken,
  isExternalLocalModeRequest: mocks.isExternalLocalModeRequest,
  parseCookieToken: mocks.parseCookieToken,
}));

vi.mock("./terminal-relay.js", () => ({
  terminalRelay: {
    getTerminalAuthContext: mocks.getTerminalAuthContext,
    attachFrontend: mocks.attachFrontend,
    detachAllForFrontend: mocks.detachAllForFrontend,
    relayFromFrontend: mocks.relayFromFrontend,
  },
}));

vi.mock("./db.js", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    session: {
      findFirst: vi.fn(),
    },
    channel: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("../services/runtime-access.js", () => ({
  runtimeAccessService: {
    assertAccess: mocks.assertAccess,
  },
}));

import { handleTerminalConnection } from "./terminal-handler.js";
import { prisma } from "./db.js";
import { AuthorizationError } from "./errors.js";

const prismaMock = prisma as unknown as {
  user: { findUnique: ReturnType<typeof vi.fn> };
  session: { findFirst: ReturnType<typeof vi.fn> };
  channel: { findFirst: ReturnType<typeof vi.fn> };
};

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
    mocks.attachFrontend.mockReturnValue(true);
    mocks.assertAccess.mockResolvedValue(undefined);
    prismaMock.user.findUnique.mockResolvedValue({ id: "user-1" });
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

  it("denies attach when the authenticated user did not create the terminal", async () => {
    mocks.getTerminalAuthContext.mockReturnValue({
      kind: "session",
      sessionId: "session-1",
      sessionGroupId: "group-1",
      runtimeInstanceId: "runtime-1",
      ownerUserId: "user-2",
    });
    const ws = createMockWs();

    handleTerminalConnection(ws as never, {
      headers: {},
      url: "/terminal?token=session-token",
      socket: { remoteAddress: "127.0.0.1" },
    });
    await Promise.resolve();
    ws.emitMessage({ type: "attach", terminalId: "term-1" });
    await Promise.resolve();

    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "error", message: "Access denied" }),
    );
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    expect(mocks.attachFrontend).not.toHaveBeenCalled();
  });

  it("revalidates terminal capability before forwarding input after attach", async () => {
    mocks.getTerminalAuthContext.mockReturnValue({
      kind: "session",
      sessionId: "session-1",
      sessionGroupId: "group-1",
      runtimeInstanceId: "runtime-1",
      ownerUserId: "user-1",
    });
    prismaMock.session.findFirst.mockResolvedValue({
      id: "session-1",
      organizationId: "org-1",
      sessionGroupId: "group-1",
    });
    mocks.assertAccess
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new AuthorizationError("revoked"));
    const ws = createMockWs();

    handleTerminalConnection(ws as never, {
      headers: {},
      url: "/terminal?token=session-token",
      socket: { remoteAddress: "127.0.0.1" },
    });
    await Promise.resolve();
    ws.emitMessage({ type: "attach", terminalId: "term-1" });
    await Promise.resolve();
    await Promise.resolve();
    ws.emitMessage({ type: "input", data: "whoami\n" });

    await vi.waitFor(() => {
      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({ type: "error", message: "Access denied" }),
      );
    });
    expect(mocks.relayFromFrontend).not.toHaveBeenCalled();
    expect(ws.close).toHaveBeenCalledWith(1008, "Access denied");
  });
});
