import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("./dataloader.js", () => ({
  createUserLoader: vi.fn(() => ({ kind: "loader" })),
}));

import { prisma } from "./db.js";
import { createUserLoader } from "./dataloader.js";
import {
  buildContext,
  buildWsContext,
  parseCookieToken,
  verifyToken,
} from "./auth.js";

const prismaMock = prisma as any;
const createUserLoaderMock = createUserLoader as any;

describe("auth helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses the auth cookie token", () => {
    expect(parseCookieToken("foo=bar; trace_token=abc123; baz=qux")).toBe("abc123");
    expect(parseCookieToken("foo=bar")).toBeUndefined();
  });

  it("verifies valid tokens and rejects invalid ones", () => {
    const token = jwt.sign({ userId: "user-1" }, process.env.JWT_SECRET!);

    expect(verifyToken(token)).toBe("user-1");
    expect(verifyToken("bad-token")).toBeNull();
  });

  it("builds a context from a bearer token", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "user-1",
      organizationId: "org-1",
      role: "admin",
    });

    const token = jwt.sign({ userId: "user-1" }, process.env.JWT_SECRET!);
    const context = await buildContext({
      req: {
        headers: { authorization: `Bearer ${token}` },
        cookies: {},
      },
    } as any);

    expect(context).toEqual({
      userId: "user-1",
      organizationId: "org-1",
      role: "admin",
      actorType: "user",
      userLoader: { kind: "loader" },
    });
    expect(createUserLoaderMock).toHaveBeenCalled();
  });

  it("falls back to x-user-id headers when no token is present", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "user-2",
      organizationId: "org-2",
      role: "member",
    });

    const context = await buildContext({
      req: {
        headers: { "x-user-id": "user-2" },
        cookies: {},
      },
    } as any);

    expect(context.userId).toBe("user-2");
    expect(context.organizationId).toBe("org-2");
  });

  it("rejects invalid websocket auth", async () => {
    await expect(buildWsContext({ token: "bad-token" })).rejects.toThrow("Invalid token");
    await expect(buildWsContext()).rejects.toThrow("Missing auth token for WebSocket");
  });

  it("builds websocket context from cookies", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "user-3",
      organizationId: "org-3",
      role: "observer",
    });

    const token = jwt.sign({ userId: "user-3" }, process.env.JWT_SECRET!);
    const context = await buildWsContext(undefined, `trace_token=${token}`);

    expect(context.userId).toBe("user-3");
    expect(context.role).toBe("observer");
  });
});
