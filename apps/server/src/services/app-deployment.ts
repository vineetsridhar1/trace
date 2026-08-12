import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Prisma, type AppDeployment, type AppDeploymentStatus } from "@prisma/client";
import type { DeployAppSessionInput } from "@trace/gql";
import type { AppDeploymentSpec } from "@trace/shared";
import { prisma } from "../lib/db.js";
import { decryptSecret, encryptSecret } from "../lib/encryption.js";
import { AuthorizationError, ValidationError } from "../lib/errors.js";
import {
  appDeploymentDispatcher,
  type AppDeploymentDispatcher,
} from "./app-deployment-dispatcher.js";
import { assertCanManageSessionGroup, canViewSessionGroup } from "./access.js";
import { eventService } from "./event.js";

const ACTIVE_STATUSES: AppDeploymentStatus[] = ["queued", "building", "deploying"];
const TERMINAL_STATUSES: AppDeploymentStatus[] = ["live", "failed", "superseded", "stopped"];
const DISPATCH_LEASE_MS = 5 * 60 * 1000;
const MAX_DISPATCH_ATTEMPTS = 8;
const ACTIVE_DEPLOYMENT_TIMEOUTS_MS: Partial<Record<AppDeploymentStatus, number>> = {
  queued: 15 * 60 * 1000,
  building: 45 * 60 * 1000,
  deploying: 25 * 60 * 1000,
};
const CALLBACK_TRANSITIONS: Record<AppDeploymentStatus, AppDeploymentStatus[]> = {
  queued: ["building", "failed"],
  building: ["deploying", "failed"],
  deploying: ["live", "failed"],
  live: [],
  failed: [],
  superseded: [],
  stopped: [],
};
function optionalCommand(value: string | null | undefined, name: string): string | undefined {
  const command = value?.trim();
  if (!command) return undefined;
  if (command.length > 2000) throw new ValidationError(`${name} is too long`);
  return command;
}

function relativeDirectory(value: string | null | undefined, name: string): string | undefined {
  const directory = value?.trim().replace(/\/+$/, "");
  if (!directory) return undefined;
  if (
    directory.startsWith("/") ||
    directory.includes("\\") ||
    directory.split("/").some((part) => part === ".." || part === "")
  ) {
    throw new ValidationError(`${name} must be a relative directory inside the app`);
  }
  return directory;
}

export function normalizeDeploymentSpec(input: DeployAppSessionInput): AppDeploymentSpec {
  if (input.target !== "static" && input.target !== "service") {
    throw new ValidationError("Deployment target must be static or service");
  }
  const buildCommand = optionalCommand(input.buildCommand, "buildCommand");
  if (input.target === "static") {
    const outputDirectory = relativeDirectory(input.outputDirectory, "outputDirectory");
    if (!outputDirectory) {
      throw new ValidationError("Static deployments require outputDirectory");
    }
    if (input.startCommand || input.port || input.database || input.migrationCommand) {
      throw new ValidationError(
        "Static deployments cannot include a server, database, or migration command",
      );
    }
    return { target: "static", ...(buildCommand ? { buildCommand } : {}), outputDirectory };
  }

  const startCommand = optionalCommand(input.startCommand, "startCommand");
  if (!startCommand) throw new ValidationError("Service deployments require startCommand");
  const port = input.port ?? 3000;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ValidationError("Service port must be between 1 and 65535");
  }
  const healthPath = input.healthPath?.trim() || "/";
  if (!healthPath.startsWith("/") || healthPath.length > 500) {
    throw new ValidationError("healthPath must start with /");
  }
  const database = input.database === true;
  const migrationCommand = optionalCommand(input.migrationCommand, "migrationCommand");
  if (migrationCommand && !database) {
    throw new ValidationError("migrationCommand requires database access");
  }
  return {
    target: "service",
    ...(buildCommand ? { buildCommand } : {}),
    startCommand,
    port,
    healthPath,
    database,
    ...(migrationCommand ? { migrationCommand } : {}),
  };
}

export function publicAppDeployment(deployment: AppDeployment) {
  return {
    id: deployment.id,
    sessionGroupId: deployment.sessionGroupId,
    repoId: deployment.repoId,
    sourceCheckpointId: deployment.sourceCheckpointId,
    commitSha: deployment.commitSha,
    status: deployment.status,
    target: deployment.target,
    spec: deployment.spec,
    appSlug: deployment.appSlug,
    externalJobId: deployment.externalJobId,
    imageDigest: deployment.imageDigest,
    staticPrefix: deployment.staticPrefix,
    serviceName: deployment.serviceName,
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
    .slice(0, 28);
  return `${base || "app"}-${group.id
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 32)
    .toLowerCase()}`;
}

function validateCallbackFields(deployment: AppDeployment, callback: AppDeploymentCallback): void {
  const expectedPrefix = `published-apps/${deployment.appSlug}/${deployment.id}`;
  if (callback.staticPrefix && callback.staticPrefix !== expectedPrefix) {
    throw new ValidationError("Deployment callback artifact prefix does not match this app");
  }
  if (deployment.target !== "static" && callback.staticPrefix) {
    throw new ValidationError("A service deployment cannot publish static artifacts");
  }
  if (callback.serviceName && callback.serviceName !== deployment.appSlug) {
    throw new ValidationError("Deployment callback service name does not match this app");
  }
  if (deployment.target !== "service" && callback.serviceName) {
    throw new ValidationError("A static deployment cannot publish a service route");
  }
  if (callback.imageDigest && !/^sha256:[0-9a-f]{64}$/i.test(callback.imageDigest)) {
    throw new ValidationError("Deployment callback image digest is invalid");
  }
  if (callback.url) {
    const base = process.env.TRACE_PUBLISHED_APP_BASE_HOST?.trim().toLowerCase();
    if (!base || callback.url !== `https://${deployment.appSlug}.${base}`) {
      throw new ValidationError("Deployment callback URL does not match this app");
    }
  }
  if (callback.status !== "live") return;
  if (!callback.url) throw new ValidationError("A live deployment requires its stable URL");
  if (deployment.target === "static") {
    if ((callback.staticPrefix ?? deployment.staticPrefix) !== expectedPrefix) {
      throw new ValidationError("A live static deployment requires its artifact prefix");
    }
  } else if ((callback.serviceName ?? deployment.serviceName) !== deployment.appSlug) {
    throw new ValidationError("A live service deployment requires its service name");
  }
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
  staticPrefix?: string;
  serviceName?: string;
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

  async deploy(input: DeployAppSessionInput, organizationId: string, userId: string) {
    const sessionGroupId = input.sessionGroupId;
    const spec = normalizeDeploymentSpec(input);
    if (spec.database && process.env.TRACE_APP_DATA_ENABLED !== "true") {
      throw new ValidationError(
        "Persistent PostgreSQL is not enabled for published apps in this environment",
      );
    }
    const clientMutationId = input.clientMutationId?.trim() || undefined;
    if (clientMutationId && clientMutationId.length > 200) {
      throw new ValidationError("clientMutationId is too long");
    }
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
    const encryptedToken = encryptSecret(callbackToken);
    const transactionResult = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${sessionGroupId}))`;
      if (clientMutationId) {
        const idempotent = await tx.appDeployment.findFirst({
          where: { organizationId, clientMutationId },
        });
        if (idempotent) return { deployment: idempotent, created: false, event: null };
      }
      const existing = await tx.appDeployment.findFirst({
        where: { sessionGroupId, status: { in: ACTIVE_STATUSES } },
        orderBy: { createdAt: "desc" },
      });
      if (
        existing?.sourceCheckpointId === checkpoint.id &&
        JSON.stringify(existing.spec) === JSON.stringify(spec)
      ) {
        return { deployment: existing, created: false, event: null };
      }
      if (existing) {
        throw new ValidationError(
          "This app already has a deployment in progress; wait for it to finish before publishing again",
        );
      }
      const deployment = await tx.appDeployment.create({
        data: {
          organizationId,
          sessionGroupId,
          repoId: group.repoId!,
          sourceCheckpointId: checkpoint.id,
          commitSha: checkpoint.commitSha,
          target: spec.target,
          spec: spec as Prisma.InputJsonValue,
          appSlug: deploymentSlug(group),
          requestedByUserId: userId,
          callbackTokenHash: tokenHash(callbackToken).toString("hex"),
          callbackTokenEncrypted: encryptedToken.encrypted,
          callbackTokenIv: encryptedToken.iv,
          clientMutationId,
        },
      });
      const event = await eventService.create(
        {
          organizationId,
          scopeType: "session",
          scopeId: sessionGroupId,
          eventType: "app_deployment_queued",
          payload: { deployment: publicAppDeployment(deployment), sessionGroupId },
          actorType: "user",
          actorId: userId,
          deferPublish: true,
        },
        tx,
      );
      return { deployment, created: true, event };
    });
    if (!transactionResult.created) return transactionResult.deployment;
    if (!transactionResult.event) throw new Error("Queued deployment event was not created");
    eventService.publishCreated(transactionResult.event);
    await this.dispatchPending(transactionResult.deployment.id);
    return prisma.appDeployment.findUniqueOrThrow({
      where: { id: transactionResult.deployment.id },
    });
  }

  async reconcilePendingDispatches(limit = 10): Promise<number> {
    const deployments = await prisma.appDeployment.findMany({
      where: { status: "queued", dispatchedAt: null, nextDispatchAt: { lte: new Date() } },
      orderBy: { nextDispatchAt: "asc" },
      take: limit,
      select: { id: true },
    });
    for (const deployment of deployments) await this.dispatchPending(deployment.id);
    return deployments.length;
  }

  async expireStaleDeployments(limit = 10): Promise<number> {
    const now = new Date();
    const candidates = await prisma.appDeployment.findMany({
      where: {
        OR: ACTIVE_STATUSES.map((status) => ({
          status,
          updatedAt: {
            lte: new Date(now.getTime() - (ACTIVE_DEPLOYMENT_TIMEOUTS_MS[status] ?? 0)),
          },
        })),
      },
      orderBy: { updatedAt: "asc" },
      take: limit,
    });
    let expired = 0;
    for (const deployment of candidates) {
      const timeout = ACTIVE_DEPLOYMENT_TIMEOUTS_MS[deployment.status];
      if (!timeout || deployment.updatedAt.getTime() > now.getTime() - timeout) continue;
      const updated = await prisma.appDeployment.updateMany({
        where: { id: deployment.id, status: deployment.status, updatedAt: deployment.updatedAt },
        data: {
          status: "failed",
          errorMessage: `Deployment timed out while ${deployment.status}`,
          completedAt: now,
        },
      });
      if (updated.count !== 1) continue;
      expired += 1;
      await emitUpdated(
        {
          ...deployment,
          status: "failed",
          errorMessage: `Deployment timed out while ${deployment.status}`,
          completedAt: now,
          updatedAt: now,
        },
        "app-deployment-reconciler",
      );
    }
    return expired;
  }

  private async dispatchPending(deploymentId: string): Promise<void> {
    const claimed = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${deploymentId}))`;
      const deployment = await tx.appDeployment.findUnique({ where: { id: deploymentId } });
      if (
        !deployment ||
        deployment.status !== "queued" ||
        deployment.dispatchedAt ||
        deployment.nextDispatchAt > new Date()
      ) {
        return null;
      }
      await tx.appDeployment.update({
        where: { id: deploymentId },
        data: { nextDispatchAt: new Date(Date.now() + DISPATCH_LEASE_MS) },
      });
      return deployment;
    });
    if (!claimed) return;
    if (!claimed.callbackTokenEncrypted || !claimed.callbackTokenIv) {
      await this.recordDispatchFailure(claimed, new Error("Deployment callback secret is missing"));
      return;
    }
    try {
      const dispatched = await this.dispatcher.enqueue({
        deploymentId: claimed.id,
        organizationId: claimed.organizationId,
        sessionGroupId: claimed.sessionGroupId,
        repoId: claimed.repoId,
        checkpointId: claimed.sourceCheckpointId,
        commitSha: claimed.commitSha,
        appSlug: claimed.appSlug,
        spec: claimed.spec as unknown as AppDeploymentSpec,
        callback: {
          url: callbackUrl(claimed.id),
          token: decryptSecret(claimed.callbackTokenEncrypted, claimed.callbackTokenIv),
        },
        requestedAt: claimed.queuedAt.toISOString(),
      });
      await prisma.appDeployment.update({
        where: { id: claimed.id },
        data: {
          dispatchedAt: new Date(),
          externalJobId: dispatched.externalJobId,
          errorMessage: null,
        },
      });
    } catch (error) {
      await this.recordDispatchFailure(claimed, error);
    }
  }

  private async recordDispatchFailure(deployment: AppDeployment, error: unknown): Promise<void> {
    const attempts = deployment.dispatchAttempts + 1;
    const terminal = attempts >= MAX_DISPATCH_ATTEMPTS;
    const updated = await prisma.appDeployment.update({
      where: { id: deployment.id },
      data: {
        dispatchAttempts: attempts,
        errorMessage: error instanceof Error ? error.message.slice(0, 4000) : String(error),
        nextDispatchAt: new Date(Date.now() + Math.min(2 ** attempts * 15_000, 15 * 60_000)),
        ...(terminal ? { status: "failed", completedAt: new Date() } : {}),
      },
    });
    if (terminal) await emitUpdated(updated, "app-deployment-dispatcher");
  }

  async updateFromCallback(deploymentId: string, token: string, callback: AppDeploymentCallback) {
    const now = new Date();
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${deploymentId}))`;
      const existing = await tx.appDeployment.findUnique({ where: { id: deploymentId } });
      if (!existing || !validCallbackToken(existing.callbackTokenHash, token)) {
        throw new AuthorizationError("Invalid deployment callback credentials");
      }
      validateCallbackFields(existing, callback);
      if (callback.status === existing.status) {
        return {
          deployment: existing,
          supersededLive: [] as AppDeployment[],
          updated: false,
          accepted: true,
        };
      }
      if (TERMINAL_STATUSES.includes(existing.status)) {
        return {
          deployment: existing,
          supersededLive: [] as AppDeployment[],
          updated: false,
          accepted: false,
        };
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
          ...(callback.staticPrefix ? { staticPrefix: callback.staticPrefix } : {}),
          ...(callback.serviceName ? { serviceName: callback.serviceName } : {}),
          ...(callback.url ? { url: callback.url } : {}),
          ...(callback.errorMessage ? { errorMessage: callback.errorMessage.slice(0, 4000) } : {}),
          ...(!existing.startedAt ? { startedAt: now } : {}),
          ...(callback.status === "live" || callback.status === "failed"
            ? { completedAt: now }
            : {}),
        },
      });
      return { deployment, supersededLive, updated: true, accepted: true };
    });
    if (!result.updated) return { deployment: result.deployment, accepted: result.accepted };
    for (const previous of result.supersededLive) {
      await emitUpdated(
        { ...previous, status: "superseded", completedAt: now, updatedAt: now },
        "app-deployment-callback",
      );
    }
    await emitUpdated(result.deployment, "app-deployment-callback");
    return { deployment: result.deployment, accepted: true };
  }
}

export const appDeploymentService = new AppDeploymentService();
