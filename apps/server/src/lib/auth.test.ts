import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
  buildContext,
  buildWsContext,
  createBridgeAuthToken,
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

  it("parses the auth cookie token", () => {
    expect(parseCookieToken("foo=bar; trace_token=abc123; baz=qux")).toBe("abc123");
    expect(parseCookieToken("foo=bar")).toBeUndefined();
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

  it("falls back to x-user-id headers when no token is present", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: "user-2" });
    prismaMock.orgMember.findFirst.mockResolvedValueOnce({
      organizationId: "org-2",
      role: "member",
    });

    const context = await buildContext({
      req: {
        headers: { "x-user-id": "user-2" },
        cookies: {},
      },
    } as unknown as Parameters<typeof buildContext>[0]);

    expect(context.userId).toBe("user-2");
    expect(context.organizationId).toBe("org-2");
  });

  it("rejects invalid websocket auth", async () => {
    await expect(buildWsContext({ token: "bad-token" })).rejects.toThrow("Invalid token");
    await expect(buildWsContext()).rejects.toThrow("Missing auth token for WebSocket");
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
});
