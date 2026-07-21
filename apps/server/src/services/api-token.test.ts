import { beforeEach, describe, expect, it, vi } from "vitest";

// Set encryption key before the service module is evaluated (vi.hoisted runs before imports)
vi.hoisted(() => {
  // 32-byte hex key for aes-256-gcm test encryption
  process.env.TOKEN_ENCRYPTION_KEY =
    "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";
});

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

import { prisma } from "../lib/db.js";
import { ApiTokenService } from "./api-token.js";

const prismaMock = prisma as any;

describe("ApiTokenService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists all providers and marks configured ones", async () => {
    prismaMock.apiToken.findMany.mockResolvedValueOnce([
      { provider: "github", updatedAt: new Date("2026-03-01T00:00:00.000Z") },
    ]);

    const service = new ApiTokenService();
    const tokens = await service.list("user-1");

    expect(tokens).toEqual([
      { provider: "anthropic", isSet: false, updatedAt: null },
      { provider: "openai", isSet: false, updatedAt: null },
      { provider: "github", isSet: true, updatedAt: new Date("2026-03-01T00:00:00.000Z") },
      { provider: "ssh_key", isSet: false, updatedAt: null },
    ]);
  });

  it("encrypts and stores tokens", async () => {
    prismaMock.apiToken.upsert.mockImplementationOnce(async ({ create }: any) => ({
      provider: create.provider,
      updatedAt: new Date("2026-03-02T00:00:00.000Z"),
      encryptedToken: create.encryptedToken,
      iv: create.iv,
    }));

    const service = new ApiTokenService();
    const result = await service.set("user-1", "github", "plain-secret");

    expect(result).toEqual({
      provider: "github",
      isSet: true,
      updatedAt: new Date("2026-03-02T00:00:00.000Z"),
    });

    const upsertArg = prismaMock.apiToken.upsert.mock.calls[0][0];
    expect(upsertArg.create.encryptedToken).not.toBe("plain-secret");
    expect(upsertArg.create.iv).toMatch(/[a-f0-9]{32}/);
  });

  it("deletes existing tokens and returns false for missing ones", async () => {
    prismaMock.apiToken.findUnique.mockResolvedValueOnce(null);

    const service = new ApiTokenService();
    await expect(service.delete("user-1", "github")).resolves.toBe(false);

    prismaMock.apiToken.findUnique.mockResolvedValueOnce({ id: "tok-1" });
    await expect(service.delete("user-1", "github")).resolves.toBe(true);
    expect(prismaMock.apiToken.delete).toHaveBeenCalled();
  });

  it("decrypts stored tokens by provider", async () => {
    prismaMock.apiToken.upsert.mockImplementationOnce(async ({ create }: any) => ({
      provider: create.provider,
      updatedAt: new Date(),
      encryptedToken: create.encryptedToken,
      iv: create.iv,
    }));

    const service = new ApiTokenService();
    await service.set("user-1", "openai", "openai-secret");
    const stored = prismaMock.apiToken.upsert.mock.calls[0][0].create;

    prismaMock.apiToken.findMany.mockResolvedValueOnce([
      {
        provider: "openai",
        encryptedToken: stored.encryptedToken,
        iv: stored.iv,
      },
    ]);

    await expect(service.getDecryptedTokens("user-1")).resolves.toEqual({
      openai: "openai-secret",
    });
  });
});
