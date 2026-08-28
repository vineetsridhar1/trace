import { createHash } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("./event.js", () => ({
  eventService: { create: vi.fn(), publishCreated: vi.fn() },
}));

import { prisma } from "../lib/db.js";
import { integrationCredentialService } from "./integration-credential.js";
import { eventService } from "./event.js";

const prismaMock = prisma as ReturnType<typeof import("../../test/helpers.js").createPrismaMock>;
const eventServiceMock = eventService as unknown as {
  create: ReturnType<typeof vi.fn>;
  publishCreated: ReturnType<typeof vi.fn>;
};

describe("IntegrationCredentialService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(
      async (callback: (tx: typeof prismaMock) => Promise<unknown>) => callback(prismaMock),
    );
    eventServiceMock.create.mockResolvedValue({ id: "event-1" });
  });

  it("issues an opaque hashed credential for allowlisted coding channels", async () => {
    prismaMock.orgMember.findUnique.mockResolvedValue({ role: "admin" });
    prismaMock.channel.findMany.mockResolvedValue([{ id: "channel-1" }]);
    prismaMock.integrationCredential.create.mockImplementation(async ({ data }) => ({
      id: "credential-1",
      ...data,
      revokedAt: null,
      lastUsedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    const result = await integrationCredentialService.create({
      organizationId: "org-1",
      name: "Incident bot",
      allowedChannelIds: ["channel-1"],
      actorId: "user-1",
    });

    expect(result.token).toMatch(/^trc_int_[A-Za-z0-9_-]{43}$/);
    expect(prismaMock.integrationCredential.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: "org-1",
        createdById: "user-1",
        scopes: ["sessions_create", "sessions_read"],
        allowedChannelIds: ["channel-1"],
        tokenHash: createHash("sha256").update(result.token).digest("hex"),
      }),
    });
    expect(JSON.stringify(prismaMock.integrationCredential.create.mock.calls[0])).not.toContain(
      result.token,
    );
    expect(eventServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "integration_credential_created",
        payload: expect.not.objectContaining({ token: expect.anything() }),
      }),
      prismaMock,
    );
    expect(eventServiceMock.publishCreated).toHaveBeenCalledWith({ id: "event-1" });
  });

  it("authenticates an active scoped credential and touches lastUsedAt", async () => {
    prismaMock.integrationCredential.findUnique.mockResolvedValue({
      id: "credential-1",
      organizationId: "org-1",
      createdById: "user-1",
      scopes: ["sessions_create", "sessions_read"],
      allowedChannelIds: ["channel-1"],
      revokedAt: null,
      expiresAt: null,
      createdBy: { orgMemberships: [{ organizationId: "org-1" }] },
    });
    prismaMock.integrationCredential.updateMany.mockResolvedValue({ count: 1 });

    const credential = await integrationCredentialService.authenticate(
      "trc_int_valid-token",
      "sessions_create",
    );

    expect(credential).toEqual(
      expect.objectContaining({ id: "credential-1", organizationId: "org-1" }),
    );
    expect(prismaMock.integrationCredential.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { lastUsedAt: expect.any(Date) } }),
    );
  });

  it("rejects revoked credentials without touching them", async () => {
    prismaMock.integrationCredential.findUnique.mockResolvedValue({
      id: "credential-1",
      organizationId: "org-1",
      createdById: "user-1",
      scopes: ["sessions_read"],
      allowedChannelIds: ["channel-1"],
      revokedAt: new Date(),
      expiresAt: null,
      createdBy: { orgMemberships: [{ organizationId: "org-1" }] },
    });

    await expect(
      integrationCredentialService.authenticate("trc_int_revoked", "sessions_read"),
    ).resolves.toBeNull();
    expect(prismaMock.integrationCredential.updateMany).not.toHaveBeenCalled();
  });
});
