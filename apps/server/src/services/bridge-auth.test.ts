import { beforeEach, describe, expect, it, vi } from "vitest";
import { BridgeAccessChallengeStatus } from "@prisma/client";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("../lib/session-router.js", () => ({
  sessionRouter: {
    getRuntime: vi.fn(),
  },
}));

vi.mock("./inbox.js", () => ({
  inboxService: {
    createItem: vi.fn().mockResolvedValue(undefined),
    resolveBySource: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../lib/pubsub.js", async () => {
  const { createPubsubMock } = await import("../../test/helpers.js");
  return {
    pubsub: createPubsubMock(),
    topics: {
      userNotifications: vi.fn((orgId: string, userId: string) => `user:${orgId}:${userId}`),
    },
  };
});

import { prisma } from "../lib/db.js";
import { sessionRouter } from "../lib/session-router.js";
import { inboxService } from "./inbox.js";
import { pubsub } from "../lib/pubsub.js";
import { bridgeAuthService } from "./bridge-auth.js";

const prismaMock = prisma as any;
const sessionRouterMock = sessionRouter as any;
const inboxServiceMock = inboxService as any;
const pubsubMock = pubsub as any;

describe("BridgeAuthService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.orgMember.findUnique.mockResolvedValue(null);
    prismaMock.bridgeAccessChallenge.create.mockResolvedValue({
      id: "challenge-1",
      runtimeId: "runtime-1",
      runtimeLabel: "Owner Bridge",
    });
    prismaMock.bridgeAccessChallenge.update.mockResolvedValue(undefined);
    prismaMock.bridgeAccessGrant.upsert.mockResolvedValue(undefined);
    prismaMock.$queryRaw.mockResolvedValue([]);
  });

  it("rejects challenge creation for runtimes whose owner is outside the active organization", async () => {
    sessionRouterMock.getRuntime.mockReturnValueOnce({
      id: "runtime-1",
      label: "Owner Bridge",
      ownerUserId: "user-2",
    });

    await expect(
      bridgeAuthService.createChallenge({
        runtimeId: "runtime-1",
        requesterId: "user-1",
        requesterName: "Requester",
        organizationId: "org-1",
        action: "send_message",
        sessionId: "session-1",
        promptPreview: "Please continue the session.",
      }),
    ).rejects.toThrow("Runtime not available in this organization");

    expect(inboxServiceMock.createItem).not.toHaveBeenCalled();
    expect(pubsubMock.publish).not.toHaveBeenCalled();
  });

  it("creates an immediate grant when verifying an existing-session challenge", async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([
      {
        id: "challenge-1",
        code: "42",
        requesterId: "user-1",
        status: BridgeAccessChallengeStatus.pending,
        attempts: 0,
        expiresAt: new Date(Date.now() + 60_000),
        runtimeId: "runtime-1",
        sessionId: "session-1",
        organizationId: "org-1",
      },
    ]);

    await expect(
      bridgeAuthService.verifyChallenge("challenge-1", "42", "user-1"),
    ).resolves.toEqual({
      granted: true,
      sessionId: "session-1",
    });

    expect(prismaMock.bridgeAccessChallenge.update).toHaveBeenCalledWith({
      where: { id: "challenge-1" },
      data: { status: BridgeAccessChallengeStatus.verified },
    });
    expect(prismaMock.bridgeAccessGrant.upsert).toHaveBeenCalledWith({
      where: {
        runtimeId_sessionId_grantedToUserId: {
          runtimeId: "runtime-1",
          sessionId: "session-1",
          grantedToUserId: "user-1",
        },
      },
      update: {},
      create: {
        runtimeId: "runtime-1",
        sessionId: "session-1",
        grantedToUserId: "user-1",
        organizationId: "org-1",
        challengeId: "challenge-1",
      },
    });
  });
});
