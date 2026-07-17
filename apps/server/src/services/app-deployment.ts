import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { AppDeployment, AppDeploymentStatus } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { AuthorizationError, ValidationError } from "../lib/errors.js";
import {
  appDeploymentDispatcher,
  type AppDeploymentDispatcher,
} from "./app-deployment-dispatcher.js";
import { assertCanManageSessionGroup, canViewSessionGroup } from "./access.js";
import { eventService } from "./event.js";

const ACTIVE_STATUSES: AppDeploymentStatus[] = ["queued", "building", "deploying"];
const TERMINAL_STATUSES: AppDeploymentStatus[] = ["live", "failed", "superseded", "stopped"];
const CALLBACK_TRANSITIONS: Record<AppDeploymentStatus, AppDeploymentStatus[]> = {
  queued: ["building", "failed"],
  building: ["deploying", "failed"],
  deploying: ["live", "failed"],
  live: [],
  failed: [],
  superseded: [],
  stopped: [],
};

export function publicAppDeployment(deployment: AppDeployment) {
  return {
    id: deployment.id,
    sessionGroupId: deployment.sessionGroupId,
    repoId: deployment.repoId,
    sourceCheckpointId: deployment.sourceCheckpointId,
    commitSha: deployment.commitSha,
    status: deployment.status,
    externalJobId: deployment.externalJobId,
    imageDigest: deployment.imageDigest,
    url: deployment.url,
    errorMessage: deployment.errorMessage,
    queuedAt: deployment.queuedAt.toISOString(),
    startedAt: deployment.startedAt?.toISOString() ?? null,
    completedAt: deployment.completedAt?.toISOString() ?? null,
    createdAt: deployment.createdAt.toISOString(),
    updatedAt: deployment.updatedAt.toISOString(),
  };
}

function deploymentSlug(group: { id: string; slug: string | null }): string {
  const base = (group.slug ?? "app")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${base || "app"}-${group.id
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 8)
    .toLowerCase()}`;
}

function callbackUrl(deploymentId: string): string {
  const raw = process.env.TRACE_SERVER_PUBLIC_URL?.trim();
  if (!raw) throw new Error("TRACE_SERVER_PUBLIC_URL is required to publish apps");
  const base = new URL(raw);
  if (base.protocol !== "http:" && base.protocol !== "https:") {
    throw new Error("TRACE_SERVER_PUBLIC_URL must use http:// or https://");
  }
  return new URL(`/internal/app-deployments/${deploymentId}/status`, base).toString();
}

function tokenHash(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}

function validCallbackToken(expectedHash: string, token: string): boolean {
  const expected = Buffer.from(expectedHash, "hex");
  const actual = tokenHash(token);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function emitUpdated(deployment: AppDeployment, actorId: string) {
  await eventService.create({
    organizationId: deployment.organizationId,
    scopeType: "session",
    scopeId: deployment.sessionGroupId,
    eventType: "app_deployment_updated",
    payload: {
      deployment: publicAppDeployment(deployment),
      sessionGroupId: deployment.sessionGroupId,
    },
    actorType: "system",
    actorId,
  });
}

export type AppDeploymentCallback = {
  status: Extract<AppDeploymentStatus, "building" | "deploying" | "live" | "failed">;
  externalJobId?: string;
  imageDigest?: string;
  url?: string;
  errorMessage?: string;
};

export class AppDeploymentService {
  constructor(private readonly dispatcher: AppDeploymentDispatcher = appDeploymentDispatcher) {}

  async list(sessionGroupId: string, organizationId: string, userId: string) {
    const group = await prisma.sessionGroup.findFirst({
      where: { id: sessionGroupId, organizationId },
      select: { visibility: true, ownerUserId: true },
    });
    if (!group || !canViewSessionGroup(group, userId)) {
      throw new AuthorizationError("Not authorized for this session group");
    }
    return prisma.appDeployment.findMany({
      where: { sessionGroupId, organizationId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
  }

  async publish(sessionGroupId: string, organizationId: string, userId: string) {
    const group = await prisma.sessionGroup.findFirstOrThrow({
      where: { id: sessionGroupId, organizationId },
      select: { id: true, kind: true, ownerUserId: true, repoId: true, slug: true },
    });
    await assertCanManageSessionGroup(group, organizationId, userId, "publish apps");
    if (group.kind !== "app" || !group.repoId) {
      throw new ValidationError("Only managed app sessions can be published");
    }
    const checkpoint = await prisma.gitCheckpoint.findFirst({
      where: { sessionGroupId, repoId: group.repoId },
      orderBy: [{ committedAt: "desc" }, { createdAt: "desc" }],
    });
    if (!checkpoint) throw new ValidationError("Commit the app before publishing");

    const callbackToken = randomBytes(32).toString("base64url");
    const createdAt = new Date();
    const transactionResult = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${sessionGroupId}))`;
      const existing = await tx.appDeployment.findFirst({
        where: { sessionGroupId, status: { in: ACTIVE_STATUSES } },
        orderBy: { createdAt: "desc" },
      });
      if (existing?.sourceCheckpointId === checkpoint.id) {
        return { deployment: existing, created: false, superseded: [] as AppDeployment[] };
      }
      const superseded = await tx.appDeployment.findMany({
        where: { sessionGroupId, status: { in: ACTIVE_STATUSES } },
      });
      if (superseded.length > 0) {
        await tx.appDeployment.updateMany({
          where: { id: { in: superseded.map((item) => item.id) } },
          data: { status: "superseded", completedAt: createdAt },
        });
      }
      const deployment = await tx.appDeployment.create({
        data: {
          organizationId,
          sessionGroupId,
          repoId: group.repoId!,
          sourceCheckpointId: checkpoint.id,
          commitSha: checkpoint.commitSha,
          requestedByUserId: userId,
          callbackTokenHash: tokenHash(callbackToken).toString("hex"),
        },
      });
      return {
        deployment,
        created: true,
        superseded: superseded.map((item) => ({
          ...item,
          status: "superseded" as const,
          completedAt: createdAt,
          updatedAt: createdAt,
        })),
      };
    });
    if (!transactionResult.created) return transactionResult.deployment;

    for (const superseded of transactionResult.superseded) {
      await emitUpdated(superseded, "app-deployment-publisher");
    }
    let deployment = transactionResult.deployment;
    await eventService.create({
      organizationId,
      scopeType: "session",
      scopeId: sessionGroupId,
      eventType: "app_deployment_queued",
      payload: { deployment: publicAppDeployment(deployment), sessionGroupId },
      actorType: "user",
      actorId: userId,
    });

    try {
      const dispatched = await this.dispatcher.enqueue({
        deploymentId: deployment.id,
        organizationId,
        sessionGroupId,
        repoId: group.repoId,
        checkpointId: checkpoint.id,
        commitSha: checkpoint.commitSha,
        appSlug: deploymentSlug(group),
        callback: { url: callbackUrl(deployment.id), token: callbackToken },
        requestedAt: deployment.queuedAt.toISOString(),
      });
      if (dispatched.externalJobId) {
        deployment = await prisma.appDeployment.update({
          where: { id: deployment.id },
          data: { externalJobId: dispatched.externalJobId },
        });
      }
      return deployment;
    } catch (error) {
      deployment = await prisma.appDeployment.update({
        where: { id: deployment.id },
        data: {
          status: "failed",
          errorMessage: error instanceof Error ? error.message : String(error),
          completedAt: new Date(),
        },
      });
      await emitUpdated(deployment, "app-deployment-dispatcher");
      throw error;
    }
  }

  async updateFromCallback(deploymentId: string, token: string, callback: AppDeploymentCallback) {
    const now = new Date();
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${deploymentId}))`;
      const existing = await tx.appDeployment.findUnique({ where: { id: deploymentId } });
      if (!existing || !validCallbackToken(existing.callbackTokenHash, token)) {
        throw new AuthorizationError("Invalid deployment callback credentials");
      }
      if (callback.status === existing.status || TERMINAL_STATUSES.includes(existing.status)) {
        return { deployment: existing, supersededLive: [] as AppDeployment[], updated: false };
      }
      if (!CALLBACK_TRANSITIONS[existing.status].includes(callback.status)) {
        throw new ValidationError(
          `Invalid app deployment transition from ${existing.status} to ${callback.status}`,
        );
      }
      const supersededLive =
        callback.status === "live"
          ? await tx.appDeployment.findMany({
              where: {
                sessionGroupId: existing.sessionGroupId,
                status: "live",
                id: { not: existing.id },
              },
            })
          : [];
      if (supersededLive.length > 0) {
        await tx.appDeployment.updateMany({
          where: { id: { in: supersededLive.map((item) => item.id) } },
          data: { status: "superseded", completedAt: now },
        });
      }
      const deployment = await tx.appDeployment.update({
        where: { id: deploymentId },
        data: {
          status: callback.status,
          ...(callback.externalJobId ? { externalJobId: callback.externalJobId } : {}),
          ...(callback.imageDigest ? { imageDigest: callback.imageDigest } : {}),
          ...(callback.url ? { url: callback.url } : {}),
          ...(callback.errorMessage ? { errorMessage: callback.errorMessage.slice(0, 4000) } : {}),
          ...(!existing.startedAt ? { startedAt: now } : {}),
          ...(callback.status === "live" || callback.status === "failed"
            ? { completedAt: now }
            : {}),
        },
      });
      return { deployment, supersededLive, updated: true };
    });
    if (!result.updated) return result.deployment;
    for (const previous of result.supersededLive) {
      await emitUpdated(
        { ...previous, status: "superseded", completedAt: now, updatedAt: now },
        "app-deployment-callback",
      );
    }
    await emitUpdated(result.deployment, "app-deployment-callback");
    return result.deployment;
  }
}

export const appDeploymentService = new AppDeploymentService();
