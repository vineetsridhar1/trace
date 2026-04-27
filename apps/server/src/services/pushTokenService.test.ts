import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

import { prisma } from "../lib/db.js";
import { PushTokenService } from "./pushTokenService.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prismaMock = prisma as any;

describe("PushTokenService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("upserts on (userId, token) and bumps lastSeenAt on re-register", async () => {
    prismaMock.pushToken.upsert.mockImplementation(
      async ({ create }: { create: Record<string, unknown> }) => ({
        id: "pt-1",
        ...create,
      }),
    );

    const service = new PushTokenService();
    await expect(
      service.register({ userId: "u-1", organizationId: "o-1", token: "tok-a", platform: "ios" }),
    ).resolves.toBe(true);

    const firstCall = prismaMock.pushToken.upsert.mock.calls[0][0];
    expect(firstCall.where).toEqual({ userId_token: { userId: "u-1", token: "tok-a" } });
    expect(firstCall.create).toMatchObject({
      userId: "u-1",
      organizationId: "o-1",
      token: "tok-a",
      platform: "ios",
    });
    expect(firstCall.create.lastSeenAt).toBeInstanceOf(Date);
    expect(firstCall.update).toMatchObject({ organizationId: "o-1", platform: "ios" });
    expect(firstCall.update.lastSeenAt).toBeInstanceOf(Date);

    // Second call — same (user, token) → still upsert, still resolves true
    await expect(
      service.register({ userId: "u-1", organizationId: "o-1", token: "tok-a", platform: "ios" }),
    ).resolves.toBe(true);
    expect(prismaMock.pushToken.upsert).toHaveBeenCalledTimes(2);
  });

  it("register allows null organizationId", async () => {
    prismaMock.pushToken.upsert.mockResolvedValue({ id: "pt-2" });
    const service = new PushTokenService();

    await service.register({
      userId: "u-1",
      organizationId: null,
      token: "tok-b",
      platform: "android",
    });

    const call = prismaMock.pushToken.upsert.mock.calls[0][0];
    expect(call.create.organizationId).toBeNull();
    expect(call.update.organizationId).toBeNull();
  });

  it("unregister returns true when a token is deleted", async () => {
    prismaMock.pushToken.deleteMany.mockResolvedValueOnce({ count: 1 });
    const service = new PushTokenService();
    await expect(service.unregister({ userId: "u-1", token: "tok-a" })).resolves.toBe(true);
    expect(prismaMock.pushToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: "u-1", token: "tok-a" },
    });
  });

  it("unregister is idempotent (no-op when token absent)", async () => {
    prismaMock.pushToken.deleteMany.mockResolvedValueOnce({ count: 0 });
    const service = new PushTokenService();
    await expect(service.unregister({ userId: "u-1", token: "missing" })).resolves.toBe(false);
  });

  it("listActiveTokensForUser scopes strictly to (userId, organizationId) — excludes null-org tokens", async () => {
    const rows = [
      { id: "pt-1", userId: "u-1", token: "tok-a", platform: "ios", organizationId: "o-1" },
    ];
    prismaMock.pushToken.findMany.mockResolvedValueOnce(rows);

    const service = new PushTokenService();
    await expect(service.listActiveTokensForUser("u-1", "o-1")).resolves.toEqual(rows);

    expect(prismaMock.pushToken.findMany).toHaveBeenCalledWith({
      where: { userId: "u-1", organizationId: "o-1" },
      orderBy: { lastSeenAt: "desc" },
    });
  });

  it("listActiveTokensForUser with null org only returns null-org tokens", async () => {
    prismaMock.pushToken.findMany.mockResolvedValueOnce([]);

    const service = new PushTokenService();
    await service.listActiveTokensForUser("u-1", null);

    expect(prismaMock.pushToken.findMany).toHaveBeenCalledWith({
      where: { userId: "u-1", organizationId: null },
      orderBy: { lastSeenAt: "desc" },
    });
  });
});
