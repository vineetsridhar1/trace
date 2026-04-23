import jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("./dataloader.js", () => ({
  createUserLoader: vi.fn(() => ({ kind: "userLoader" })),
  createSessionLoader: vi.fn(() => ({ kind: "sessionLoader" })),
  createSessionGroupLoader: vi.fn(() => ({ kind: "sessionGroupLoader" })),
  createRepoLoader: vi.fn(() => ({ kind: "repoLoader" })),
  createEventLoader: vi.fn(() => ({ kind: "eventLoader" })),
  createConversationLoader: vi.fn(() => ({ kind: "conversationLoader" })),
  createBranchLoader: vi.fn(() => ({ kind: "branchLoader" })),
  createTurnLoader: vi.fn(() => ({ kind: "turnLoader" })),
  createChatMembersLoader: vi.fn(() => ({ kind: "chatMembersLoader" })),
  createSessionTicketsLoader: vi.fn(() => ({ kind: "sessionTicketsLoader" })),
  createChannelMembershipLoader: vi.fn(() => ({ kind: "channelMembershipLoader" })),
  createChatMembershipLoader: vi.fn(() => ({ kind: "chatMembershipLoader" })),
}));

import { prisma } from "./db.js";
import { createUserLoader } from "./dataloader.js";
import {
  authenticateAccessToken,
  buildContext,
  buildWsContext,
  createBridgeAuthToken,
  isLoopbackRequest,
  parseCookieToken,
  verifyBridgeAuthToken,
  verifyToken,
} from "./auth.js";

const JWT_SECRET = process.env.JWT_SECRET || "trace-dev-secret";
const prismaMock = prisma as ReturnType<typeof import("../../test/helpers.js").createPrismaMock>;
const createUserLoaderMock = createUserLoader as unknown as ReturnType<typeof vi.fn>;

describe("auth helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("parses the auth cookie token", () => {
    expect(parseCookieToken("foo=bar; trace_token=abc123; baz=qux")).toBe("abc123");
    expect(parseCookieToken("foo=bar")).toBeUndefined();
  });

  it("only treats requests as loopback when the socket and forwarded client are loopback", () => {
    expect(
      isLoopbackRequest({
        headers: {},
        socket: { remoteAddress: "127.0.0.1" },
      }),
    ).toBe(true);
    expect(
      isLoopbackRequest({
        headers: { "x-forwarded-for": "203.0.113.10" },
        socket: { remoteAddress: "127.0.0.1" },
      }),
    ).toBe(false);
    expect(
      isLoopbackRequest({
        headers: { "x-forwarded-for": "127.0.0.1" },
        socket: { remoteAddress: "203.0.113.10" },
      }),
    ).toBe(false);
  });

  it("verifies valid tokens and rejects invalid ones", () => {
    const token = jwt.sign({ userId: "user-1" }, JWT_SECRET);

    expect(verifyToken(token)).toBe("user-1");
    expect(verifyToken("bad-token")).toBeNull();
  });

  it("verifies bridge auth tokens separately from session tokens", () => {
    const { token } = createBridgeAuthToken({
      userId: "user-1",
      organizationId: "org-1",
      instanceId: "bridge-1",
    });

    expect(verifyToken(token)).toBeNull();
    expect(verifyBridgeAuthToken(token)).toMatchObject({
      userId: "user-1",
      organizationId: "org-1",
      instanceId: "bridge-1",
      tokenType: "bridge_auth",
    });
  });

  it("authenticates opaque local mobile device secrets", async () => {
    prismaMock.localMobileDevice.findUnique.mockResolvedValueOnce({
      id: "device-1",
      ownerUserId: "user-1",
      organizationId: "org-1",
      revokedAt: null,
    });
    prismaMock.localMobileDevice.updateMany.mockResolvedValueOnce({ count: 1 });

    await expect(authenticateAccessToken("opaque-device-secret")).resolves.toEqual({
      kind: "local_mobile",
      userId: "user-1",
      organizationId: "org-1",
      deviceId: "device-1",
    });
  });

  it("builds a context from a bearer token", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: "user-1" });
    prismaMock.orgMember.findFirst.mockResolvedValueOnce({
      organizationId: "org-1",
      role: "admin",
    });

    const token = jwt.sign({ userId: "user-1" }, JWT_SECRET);
    const context = await buildContext({
      req: {
        headers: { authorization: `Bearer ${token}` },
        cookies: {},
      },
    } as unknown as Parameters<typeof buildContext>[0]);

    expect(context.userId).toBe("user-1");
    expect(context.organizationId).toBe("org-1");
    expect(context.role).toBe("admin");
    expect(context.actorType).toBe("user");
    expect(createUserLoaderMock).toHaveBeenCalled();
  });

  it("requires a token for HTTP context construction", async () => {
    await expect(
      buildContext({
        req: {
          headers: {},
          cookies: {},
        },
      } as unknown as Parameters<typeof buildContext>[0]),
    ).rejects.toThrow("Not authenticated");
  });

  it("rejects session tokens for external local-mode HTTP access", async () => {
    vi.stubEnv("TRACE_LOCAL_MODE", "1");

    const token = jwt.sign({ userId: "user-2" }, JWT_SECRET);
    await expect(
      buildContext({
        req: {
          headers: {
            authorization: `Bearer ${token}`,
            "x-forwarded-for": "203.0.113.10",
          },
          cookies: {},
          socket: { remoteAddress: "127.0.0.1" },
        },
      } as unknown as Parameters<typeof buildContext>[0]),
    ).rejects.toThrow("External local-mode access requires a paired mobile token");
  });

  it("forces HTTP auth context onto the canonical local organization", async () => {
    vi.stubEnv("TRACE_LOCAL_MODE", "1");

    prismaMock.user.findUnique.mockResolvedValueOnce({ id: "user-2", email: "local@trace.dev" });
    prismaMock.organization.findFirst.mockResolvedValueOnce({ id: "org-local" });
    prismaMock.orgMember.findUnique.mockResolvedValueOnce({
      role: "member",
    });

    const token = jwt.sign({ userId: "user-2" }, JWT_SECRET);
    const context = await buildContext({
      req: {
        headers: {
          authorization: `Bearer ${token}`,
          "x-organization-id": "org-stale",
        },
        cookies: {},
        socket: { remoteAddress: "127.0.0.1" },
      },
    } as unknown as Parameters<typeof buildContext>[0]);

    expect(context.organizationId).toBe("org-local");
    expect(context.role).toBe("member");
  });

  it("rejects invalid websocket auth", async () => {
    await expect(buildWsContext({ token: "bad-token" })).rejects.toThrow("Invalid token");
    await expect(buildWsContext()).rejects.toThrow("Missing auth token for WebSocket");
  });

  it("rejects session tokens for external local-mode websocket access", async () => {
    vi.stubEnv("TRACE_LOCAL_MODE", "1");

    const token = jwt.sign({ userId: "user-3" }, JWT_SECRET);
    await expect(
      buildWsContext(
        { token },
        undefined,
        {
          headers: { "x-forwarded-for": "203.0.113.20" },
          socket: { remoteAddress: "127.0.0.1" },
        },
      ),
    ).rejects.toThrow("External local-mode access requires a paired mobile token");
  });

  it("forces websocket auth context onto the canonical local organization", async () => {
    vi.stubEnv("TRACE_LOCAL_MODE", "1");

    prismaMock.user.findUnique.mockResolvedValueOnce({ id: "user-3", email: "local@trace.dev" });
    prismaMock.organization.findFirst.mockResolvedValueOnce({ id: "org-local" });
    prismaMock.orgMember.findUnique.mockResolvedValueOnce({
      role: "admin",
    });

    const token = jwt.sign({ userId: "user-3" }, JWT_SECRET);
    const context = await buildWsContext({
      token,
      organizationId: "org-stale",
    });

    expect(context.organizationId).toBe("org-local");
    expect(context.role).toBe("admin");
  });

  it("builds websocket context from cookies", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: "user-3" });
    prismaMock.orgMember.findFirst.mockResolvedValueOnce({
      organizationId: "org-3",
      role: "observer",
    });

    const token = jwt.sign({ userId: "user-3" }, JWT_SECRET);
    const context = await buildWsContext(undefined, `trace_token=${token}`);

    expect(context.userId).toBe("user-3");
    expect(context.role).toBe("observer");
  });

  it("pins local mobile websocket auth to its paired organization", async () => {
    prismaMock.localMobileDevice.findUnique.mockResolvedValueOnce({
      id: "device-2",
      ownerUserId: "user-4",
      organizationId: "org-local",
      revokedAt: null,
    });
    prismaMock.localMobileDevice.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: "user-4", email: "local@trace.dev" });
    prismaMock.orgMember.findUnique.mockResolvedValueOnce({
      role: "admin",
    });

    const context = await buildWsContext({
      token: "opaque-device-secret",
      organizationId: "org-local",
    });

    expect(context.userId).toBe("user-4");
    expect(context.organizationId).toBe("org-local");
    expect(context.role).toBe("admin");
  });
});
