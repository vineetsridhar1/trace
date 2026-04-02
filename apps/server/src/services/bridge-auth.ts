import { Prisma } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { sessionRouter } from "../lib/session-router.js";
import { inboxService } from "./inbox.js";
import { pubsub, topics } from "../lib/pubsub.js";

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 3;

function generateCode(): string {
  return Math.floor(Math.random() * 100)
    .toString()
    .padStart(2, "0");
}

export class BridgeAuthService {
  /**
   * Check if a user has access to a runtime — either as the owner or via a session grant.
   */
  async hasAccess(runtimeId: string, userId: string, sessionId?: string): Promise<boolean> {
    const runtime = sessionRouter.getRuntime(runtimeId);
    if (!runtime) return false;
    if (runtime.hostingMode !== "local") return true;
    if (!runtime.ownerUserId) return true;
    if (runtime.ownerUserId === userId) return true;
    if (sessionId) {
      return this.hasSessionGrant(runtimeId, sessionId, userId);
    }
    return false;
  }

  /**
   * Check if a user has an active grant for a specific session on a runtime.
   */
  async hasSessionGrant(runtimeId: string, sessionId: string, userId: string): Promise<boolean> {
    const grant = await prisma.bridgeAccessGrant.findUnique({
      where: {
        runtimeId_sessionId_grantedToUserId: {
          runtimeId,
          sessionId,
          grantedToUserId: userId,
        },
      },
    });
    return !!grant;
  }

  /**
   * Create a new challenge for bridge access verification.
   * Sends an inbox item and toast to the bridge owner.
   */
  async createChallenge(input: {
    runtimeId: string;
    requesterId: string;
    requesterName: string;
    organizationId: string;
    action: string;
    sessionId?: string;
    promptPreview?: string;
  }) {
    const runtime = sessionRouter.getRuntime(input.runtimeId);
    if (!runtime) {
      throw new Error("Runtime not found");
    }
    if (!runtime.ownerUserId) {
      throw new Error("Runtime has no owner");
    }

    const code = generateCode();
    const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);

    const challenge = await prisma.bridgeAccessChallenge.create({
      data: {
        code,
        runtimeId: input.runtimeId,
        runtimeLabel: runtime.label,
        ownerUserId: runtime.ownerUserId,
        requesterId: input.requesterId,
        requesterName: input.requesterName,
        organizationId: input.organizationId,
        action: input.action,
        promptPreview: input.promptPreview?.slice(0, 100),
        sessionId: input.sessionId,
        expiresAt,
      },
    });

    // Create inbox item for the bridge owner
    await inboxService.createItem({
      orgId: input.organizationId,
      userId: runtime.ownerUserId,
      itemType: "bridge_access_request",
      title: `${input.requesterName} wants to use your bridge`,
      summary: `Action: ${input.action}${input.promptPreview ? ` — "${input.promptPreview.slice(0, 100)}"` : ""}`,
      payload: {
        code,
        requesterName: input.requesterName,
        action: input.action,
        promptPreview: input.promptPreview?.slice(0, 100),
        runtimeLabel: runtime.label,
        challengeId: challenge.id,
        expiresAt: expiresAt.toISOString(),
      } as unknown as Prisma.InputJsonValue,
      sourceType: "bridge_challenge",
      sourceId: challenge.id,
    });

    // Publish toast notification for immediate visibility
    await pubsub.publish(topics.userNotifications(input.organizationId, runtime.ownerUserId), {
      id: challenge.id,
      type: "bridge_access_request",
      message: `${input.requesterName} wants to use your bridge "${runtime.label}"`,
      timestamp: new Date().toISOString(),
    });

    return {
      challengeId: challenge.id,
      runtimeId: input.runtimeId,
      runtimeLabel: runtime.label,
    };
  }

  /**
   * Verify a challenge code. On success, creates a grant (or stores verified status for start flow).
   */
  async verifyChallenge(challengeId: string, code: string, userId: string) {
    const challenge = await prisma.bridgeAccessChallenge.findUnique({
      where: { id: challengeId },
    });

    if (!challenge) {
      throw new Error("Challenge not found");
    }

    if (challenge.requesterId !== userId) {
      throw new Error("Not authorized to verify this challenge");
    }

    if (challenge.status !== "pending") {
      throw new Error("Challenge is no longer active");
    }

    if (new Date() > challenge.expiresAt) {
      await prisma.bridgeAccessChallenge.update({
        where: { id: challengeId },
        data: { status: "expired" },
      });
      throw new Error("Challenge has expired");
    }

    if (challenge.code !== code) {
      const newAttempts = challenge.attempts + 1;
      const expired = newAttempts >= MAX_ATTEMPTS;
      await prisma.bridgeAccessChallenge.update({
        where: { id: challengeId },
        data: {
          attempts: newAttempts,
          status: expired ? "expired" : "pending",
        },
      });
      if (expired) {
        throw new Error("Too many failed attempts. Please request a new code.");
      }
      throw new Error("Incorrect code");
    }

    // Code is correct — mark challenge as verified
    await prisma.bridgeAccessChallenge.update({
      where: { id: challengeId },
      data: { status: "verified" },
    });

    // Resolve the inbox item
    await inboxService.resolveBySource({
      sourceType: "bridge_challenge",
      sourceId: challengeId,
      orgId: challenge.organizationId,
      resolution: "verified",
    });

    // If this is for an existing session, create the grant immediately
    if (challenge.sessionId) {
      await prisma.bridgeAccessGrant.upsert({
        where: {
          runtimeId_sessionId_grantedToUserId: {
            runtimeId: challenge.runtimeId,
            sessionId: challenge.sessionId,
            grantedToUserId: userId,
          },
        },
        update: {},
        create: {
          runtimeId: challenge.runtimeId,
          sessionId: challenge.sessionId,
          grantedToUserId: userId,
          organizationId: challenge.organizationId,
          challengeId: challenge.id,
        },
      });
      return { granted: true, sessionId: challenge.sessionId };
    }

    // For start_session flow, the challenge is just verified.
    // The grant will be created when the session is actually started
    // using the bridgeAccessToken (challengeId).
    return { granted: true, sessionId: null };
  }

  /**
   * Validate a bridge access token (verified challenge ID) for the start session flow.
   * Called by session service before creating a session on someone else's bridge.
   */
  async validateAccessToken(challengeId: string, userId: string, runtimeId: string): Promise<boolean> {
    const challenge = await prisma.bridgeAccessChallenge.findUnique({
      where: { id: challengeId },
    });

    if (!challenge) return false;
    if (challenge.requesterId !== userId) return false;
    if (challenge.runtimeId !== runtimeId) return false;
    if (challenge.status !== "verified") return false;
    if (new Date() > challenge.expiresAt) return false;

    return true;
  }

  /**
   * Create a session grant from a verified challenge after a session is created.
   */
  async grantSessionFromChallenge(challengeId: string, sessionId: string) {
    const challenge = await prisma.bridgeAccessChallenge.findUnique({
      where: { id: challengeId },
    });

    if (!challenge || challenge.status !== "verified") {
      throw new Error("Invalid or unverified challenge");
    }

    await prisma.bridgeAccessGrant.upsert({
      where: {
        runtimeId_sessionId_grantedToUserId: {
          runtimeId: challenge.runtimeId,
          sessionId,
          grantedToUserId: challenge.requesterId,
        },
      },
      update: {},
      create: {
        runtimeId: challenge.runtimeId,
        sessionId,
        grantedToUserId: challenge.requesterId,
        organizationId: challenge.organizationId,
        challengeId: challenge.id,
      },
    });
  }

  /**
   * Expire all stale challenges past their TTL.
   */
  async expireChallenges() {
    await prisma.bridgeAccessChallenge.updateMany({
      where: {
        status: "pending",
        expiresAt: { lt: new Date() },
      },
      data: { status: "expired" },
    });
  }
}

export const bridgeAuthService = new BridgeAuthService();
