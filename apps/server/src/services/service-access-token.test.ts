import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("./event.js", () => ({
  eventService: {
    create: vi.fn().mockResolvedValue({ id: "event-1" }),
    publishCreated: vi.fn(),
  },
}));

import { prisma } from "../lib/db.js";
import { eventService } from "./event.js";
import {
  DEFAULT_SERVICE_TOKEN_TTL_MS,
  LAST_USED_WRITE_INTERVAL_MS,
  SERVICE_TOKEN_PREFIX,
  ServiceAccessTokenService,
  createServiceTokenSecret,
  hashServiceToken,
} from "./service-access-token.js";

const prismaMock = prisma as ReturnType<typeof import("../../test/helpers.js").createPrismaMock>;
const eventServiceMock = eventService as unknown as {
  create: ReturnType<typeof vi.fn>;
  publishCreated: ReturnType<typeof vi.fn>;
};

const NOW = new Date("2026-07-24T12:00:00.000Z");
const creator = {
  id: "user-1",
  email: "admin@example.com",
  name: "Admin",
  avatarUrl: null,
  githubId: null,
  defaultSessionTool: null,
  defaultSessionModel: null,
  defaultSessionReasoningEffort: null,
  autoArchiveMergedSessions: true,
  enableClaudeInChrome: false,
  createdAt: NOW,
  updatedAt: NOW,
};

function tokenRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "service-token-1",
    organizationId: "org-1",
    createdById: "user-1",
    name: "deployment-daemon",
    tokenPrefix: "trc_svc_example",
    scopes: ["sessions_start", "sessions_status_read"],
    expiresAt: new Date(NOW.getTime() + DEFAULT_SERVICE_TOKEN_TTL_MS),
    revokedAt: null,
    lastUsedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: creator,
    ...overrides,
  };
}

describe("ServiceAccessTokenService", () => {
  let service: ServiceAccessTokenService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    service = new ServiceAccessTokenService();
    prismaMock.orgMember.findUnique.mockResolvedValue({ role: "admin", userId: "user-1" });
  });

  it("generates a prefixed 256-bit opaque token and hashes the complete token", () => {
    const secret = createServiceTokenSecret();
    const encoded = secret.token.slice(SERVICE_TOKEN_PREFIX.length);

    expect(secret.token).toMatch(/^trc_svc_[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(encoded, "base64url")).toHaveLength(32);
    expect(secret.tokenHash).toBe(hashServiceToken(secret.token));
    expect(secret.tokenPrefix).toBe(secret.token.slice(0, 16));
  });

  it("stores only the hash, defaults expiration, and emits a secret-free event", async () => {
    prismaMock.serviceAccessToken.create.mockImplementation(async ({ data }) =>
      tokenRecord({
        tokenPrefix: data.tokenPrefix,
        expiresAt: data.expiresAt,
      }),
    );

    const result = await service.create({
      organizationId: "org-1",
      name: " deployment-daemon ",
      scopes: ["sessions_start", "sessions_status_read"],
      actorType: "user",
      actorId: "user-1",
    });

    expect(result.token).toMatch(/^trc_svc_/);
    expect(prismaMock.serviceAccessToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "deployment-daemon",
          tokenHash: hashServiceToken(result.token),
          expiresAt: new Date(NOW.getTime() + DEFAULT_SERVICE_TOKEN_TTL_MS),
        }),
        select: expect.not.objectContaining({ tokenHash: true }),
      }),
    );
    const createInput = eventServiceMock.create.mock.calls[0]?.[0];
    expect(JSON.stringify(createInput)).not.toContain(result.token);
    expect(JSON.stringify(createInput)).not.toContain(hashServiceToken(result.token));
    expect(createInput).toMatchObject({
      eventType: "service_access_token_created",
      scopeType: "system",
      scopeId: "org-1",
      deferPublish: true,
    });
    expect(eventServiceMock.publishCreated).toHaveBeenCalledWith({ id: "event-1" });
  });

  it("rejects non-admin creation and invalid expiration", async () => {
    prismaMock.orgMember.findUnique.mockResolvedValueOnce({ role: "member" });
    await expect(
      service.create({
        organizationId: "org-1",
        name: "daemon",
        scopes: ["sessions_start"],
        actorType: "user",
        actorId: "user-1",
      }),
    ).rejects.toThrow("Only organization admins");

    await expect(
      service.create({
        organizationId: "org-1",
        name: "daemon",
        scopes: ["sessions_start"],
        expiresAt: NOW,
        actorType: "user",
        actorId: "user-1",
      }),
    ).rejects.toThrow("expiration must be in the future");
  });

  it("authenticates an active token and throttles last-used writes", async () => {
    const token = `${SERVICE_TOKEN_PREFIX}active`;
    prismaMock.serviceAccessToken.findUnique.mockResolvedValueOnce(tokenRecord());
    prismaMock.serviceAccessToken.updateMany.mockResolvedValueOnce({ count: 1 });

    await expect(service.authenticate(token)).resolves.toEqual({
      kind: "service",
      userId: "user-1",
      organizationId: "org-1",
      serviceAccessTokenId: "service-token-1",
      scopes: ["sessions_start", "sessions_status_read"],
    });
    expect(prismaMock.serviceAccessToken.updateMany).toHaveBeenCalledOnce();

    prismaMock.serviceAccessToken.findUnique.mockResolvedValueOnce(
      tokenRecord({ lastUsedAt: new Date(NOW.getTime() - LAST_USED_WRITE_INTERVAL_MS + 1) }),
    );
    await service.authenticate(token);
    expect(prismaMock.serviceAccessToken.updateMany).toHaveBeenCalledOnce();
  });

  it("accepts a concurrent last-used update winner but still fails closed on revocation", async () => {
    const token = `${SERVICE_TOKEN_PREFIX}concurrent`;
    prismaMock.serviceAccessToken.findUnique
      .mockResolvedValueOnce(tokenRecord())
      .mockResolvedValueOnce({
        revokedAt: null,
        expiresAt: new Date(NOW.getTime() + DEFAULT_SERVICE_TOKEN_TTL_MS),
        lastUsedAt: NOW,
      });
    prismaMock.serviceAccessToken.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(service.authenticate(token)).resolves.toMatchObject({
      serviceAccessTokenId: "service-token-1",
    });

    prismaMock.serviceAccessToken.findUnique
      .mockResolvedValueOnce(tokenRecord())
      .mockResolvedValueOnce({
        revokedAt: NOW,
        expiresAt: new Date(NOW.getTime() + DEFAULT_SERVICE_TOKEN_TTL_MS),
        lastUsedAt: NOW,
      });
    prismaMock.serviceAccessToken.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(service.authenticate(token)).resolves.toBeNull();
  });

  it.each([
    ["unknown", null],
    ["revoked", tokenRecord({ revokedAt: NOW })],
    ["expired", tokenRecord({ expiresAt: new Date(NOW.getTime() - 1) })],
    ["deleted creator", tokenRecord({ createdById: null })],
  ])("rejects %s tokens", async (_label, record) => {
    prismaMock.serviceAccessToken.findUnique.mockResolvedValueOnce(record);
    await expect(service.authenticate(`${SERVICE_TOKEN_PREFIX}invalid`)).resolves.toBeNull();
  });

  it("rejects a token after its creator loses organization membership", async () => {
    prismaMock.serviceAccessToken.findUnique.mockResolvedValueOnce(tokenRecord());
    prismaMock.orgMember.findUnique.mockResolvedValueOnce(null);
    await expect(service.authenticate(`${SERVICE_TOKEN_PREFIX}active`)).resolves.toBeNull();
  });

  it("revokes atomically and is idempotent", async () => {
    prismaMock.serviceAccessToken.findFirst
      .mockResolvedValueOnce({ id: "service-token-1", revokedAt: null })
      .mockResolvedValueOnce({ id: "service-token-1", revokedAt: NOW });
    prismaMock.serviceAccessToken.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.serviceAccessToken.findUniqueOrThrow.mockResolvedValueOnce(
      tokenRecord({ revokedAt: NOW }),
    );

    await expect(
      service.revoke({
        id: "service-token-1",
        organizationId: "org-1",
        actorType: "user",
        actorId: "user-1",
      }),
    ).resolves.toBe(true);
    await expect(
      service.revoke({
        id: "service-token-1",
        organizationId: "org-1",
        actorType: "user",
        actorId: "user-1",
      }),
    ).resolves.toBe(false);
    expect(eventServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "service_access_token_revoked",
        deferPublish: true,
      }),
      prismaMock,
    );
  });
});
