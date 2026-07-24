import { createHash, randomBytes } from "crypto";
import type { Prisma } from "@prisma/client";
import type { ActorType, ServiceApiScope } from "@trace/gql";
import { prisma } from "../lib/db.js";
import { AuthorizationError, ValidationError } from "../lib/errors.js";
import { eventService } from "./event.js";

export const SERVICE_TOKEN_PREFIX = "trc_svc_";
export const SERVICE_TOKEN_SECRET_BYTES = 32;
export const DEFAULT_SERVICE_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;
export const MAX_SERVICE_TOKEN_TTL_MS = 365 * 24 * 60 * 60 * 1000;
export const LAST_USED_WRITE_INTERVAL_MS = 5 * 60 * 1000;

const MAX_TOKEN_NAME_LENGTH = 120;
const TOKEN_PREFIX_DISPLAY_LENGTH = 16;
const SERVICE_API_SCOPE_SET: ReadonlySet<ServiceApiScope> = new Set([
  "sessions_start",
  "sessions_status_read",
]);

export type ServiceAccessTokenSubject = {
  kind: "service";
  userId: string;
  organizationId: string;
  serviceAccessTokenId: string;
  scopes: ServiceApiScope[];
};

const SERVICE_ACCESS_TOKEN_SAFE_SELECT = {
  id: true,
  organizationId: true,
  createdById: true,
  createdBy: true,
  name: true,
  tokenPrefix: true,
  scopes: true,
  expiresAt: true,
  revokedAt: true,
  lastUsedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ServiceAccessTokenSelect;

type ServiceAccessTokenWithCreator = Prisma.ServiceAccessTokenGetPayload<{
  select: typeof SERVICE_ACCESS_TOKEN_SAFE_SELECT;
}>;

type CreateServiceAccessTokenInput = {
  organizationId: string;
  name: string;
  scopes: readonly ServiceApiScope[];
  expiresAt?: Date | string | null;
  actorType: ActorType;
  actorId: string;
};

function eventJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function normalizeScopes(scopes: readonly ServiceApiScope[]): ServiceApiScope[] {
  const uniqueScopes = [...new Set(scopes)];
  if (uniqueScopes.length === 0) {
    throw new ValidationError("At least one service API scope is required");
  }
  for (const scope of uniqueScopes) {
    if (!SERVICE_API_SCOPE_SET.has(scope)) {
      throw new ValidationError(`Unknown service API scope: ${scope}`);
    }
  }
  return uniqueScopes;
}

function normalizeExpiration(value: Date | string | null | undefined, now: Date): Date {
  const expiresAt =
    value == null ? new Date(now.getTime() + DEFAULT_SERVICE_TOKEN_TTL_MS) : new Date(value);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt <= now) {
    throw new ValidationError("Service token expiration must be in the future");
  }
  if (expiresAt.getTime() - now.getTime() > MAX_SERVICE_TOKEN_TTL_MS) {
    throw new ValidationError("Service token expiration cannot be more than 365 days away");
  }
  return expiresAt;
}

async function assertOrganizationAdmin(
  tx: Prisma.TransactionClient,
  organizationId: string,
  actorType: ActorType,
  actorId: string,
): Promise<void> {
  if (actorType !== "user") {
    throw new AuthorizationError("Only organization admins can manage service tokens");
  }
  const membership = await tx.orgMember.findUnique({
    where: { userId_organizationId: { userId: actorId, organizationId } },
    select: { role: true },
  });
  if (membership?.role !== "admin") {
    throw new AuthorizationError("Only organization admins can manage service tokens");
  }
}

export function createServiceTokenSecret(): {
  token: string;
  tokenHash: string;
  tokenPrefix: string;
} {
  const secret = randomBytes(SERVICE_TOKEN_SECRET_BYTES).toString("base64url");
  const token = `${SERVICE_TOKEN_PREFIX}${secret}`;
  return {
    token,
    tokenHash: hashServiceToken(token),
    tokenPrefix: token.slice(0, TOKEN_PREFIX_DISPLAY_LENGTH),
  };
}

export function hashServiceToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function isServiceToken(token: string): boolean {
  return token.startsWith(SERVICE_TOKEN_PREFIX);
}

export class ServiceAccessTokenService {
  async create(input: CreateServiceAccessTokenInput): Promise<{
    token: string;
    serviceAccessToken: ServiceAccessTokenWithCreator;
  }> {
    const name = input.name.trim();
    if (!name) throw new ValidationError("Service token name is required");
    if (name.length > MAX_TOKEN_NAME_LENGTH) {
      throw new ValidationError(
        `Service token name cannot exceed ${MAX_TOKEN_NAME_LENGTH} characters`,
      );
    }

    const scopes = normalizeScopes(input.scopes);
    const now = new Date();
    const expiresAt = normalizeExpiration(input.expiresAt, now);
    const secret = createServiceTokenSecret();

    const result = await prisma.$transaction(async (tx) => {
      await assertOrganizationAdmin(tx, input.organizationId, input.actorType, input.actorId);
      const serviceAccessToken = await tx.serviceAccessToken.create({
        data: {
          organizationId: input.organizationId,
          createdById: input.actorId,
          name,
          tokenHash: secret.tokenHash,
          tokenPrefix: secret.tokenPrefix,
          scopes,
          expiresAt,
        },
        select: SERVICE_ACCESS_TOKEN_SAFE_SELECT,
      });
      const event = await eventService.create(
        {
          organizationId: input.organizationId,
          scopeType: "system",
          scopeId: input.organizationId,
          eventType: "service_access_token_created",
          payload: eventJson({ serviceAccessToken }),
          actorType: input.actorType,
          actorId: input.actorId,
          deferPublish: true,
        },
        tx,
      );
      return { serviceAccessToken, event };
    });

    eventService.publishCreated(result.event);
    return { token: secret.token, serviceAccessToken: result.serviceAccessToken };
  }

  async list(input: {
    organizationId: string;
    actorType: ActorType;
    actorId: string;
  }): Promise<ServiceAccessTokenWithCreator[]> {
    return prisma.$transaction(async (tx) => {
      await assertOrganizationAdmin(tx, input.organizationId, input.actorType, input.actorId);
      return tx.serviceAccessToken.findMany({
        where: { organizationId: input.organizationId },
        select: SERVICE_ACCESS_TOKEN_SAFE_SELECT,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });
    });
  }

  async revoke(input: {
    id: string;
    organizationId: string;
    actorType: ActorType;
    actorId: string;
  }): Promise<boolean> {
    const now = new Date();
    const result = await prisma.$transaction(async (tx) => {
      await assertOrganizationAdmin(tx, input.organizationId, input.actorType, input.actorId);
      const existing = await tx.serviceAccessToken.findFirst({
        where: { id: input.id, organizationId: input.organizationId },
        select: { id: true, revokedAt: true },
      });
      if (!existing || existing.revokedAt) return null;

      const claimed = await tx.serviceAccessToken.updateMany({
        where: { id: existing.id, organizationId: input.organizationId, revokedAt: null },
        data: { revokedAt: now },
      });
      if (claimed.count !== 1) return null;

      const serviceAccessToken = await tx.serviceAccessToken.findUniqueOrThrow({
        where: { id: existing.id },
        select: SERVICE_ACCESS_TOKEN_SAFE_SELECT,
      });
      const event = await eventService.create(
        {
          organizationId: input.organizationId,
          scopeType: "system",
          scopeId: input.organizationId,
          eventType: "service_access_token_revoked",
          payload: eventJson({ serviceAccessToken }),
          actorType: input.actorType,
          actorId: input.actorId,
          deferPublish: true,
        },
        tx,
      );
      return { event };
    });

    if (!result) return false;
    eventService.publishCreated(result.event);
    return true;
  }

  async authenticate(token: string): Promise<ServiceAccessTokenSubject | null> {
    if (!isServiceToken(token)) return null;
    const now = new Date();
    const record = await prisma.serviceAccessToken.findUnique({
      where: { tokenHash: hashServiceToken(token) },
      select: {
        id: true,
        organizationId: true,
        createdById: true,
        scopes: true,
        expiresAt: true,
        revokedAt: true,
        lastUsedAt: true,
      },
    });
    if (!record || !record.createdById || record.revokedAt || record.expiresAt <= now) return null;

    const scopes = record.scopes.filter((scope): scope is ServiceApiScope =>
      SERVICE_API_SCOPE_SET.has(scope as ServiceApiScope),
    );
    if (scopes.length !== record.scopes.length) return null;

    const membership = await prisma.orgMember.findUnique({
      where: {
        userId_organizationId: {
          userId: record.createdById,
          organizationId: record.organizationId,
        },
      },
      select: { userId: true },
    });
    if (!membership) return null;

    const staleBefore = new Date(now.getTime() - LAST_USED_WRITE_INTERVAL_MS);
    if (!record.lastUsedAt || record.lastUsedAt <= staleBefore) {
      const touched = await prisma.serviceAccessToken.updateMany({
        where: {
          id: record.id,
          revokedAt: null,
          expiresAt: { gt: now },
          OR: [{ lastUsedAt: null }, { lastUsedAt: { lte: staleBefore } }],
        },
        data: { lastUsedAt: now },
      });
      if (touched.count !== 1) {
        // Another request may have won the throttled write. Re-read so that
        // concurrent valid requests succeed while a concurrent revocation or
        // expiration still fails closed.
        const current = await prisma.serviceAccessToken.findUnique({
          where: { id: record.id },
          select: { revokedAt: true, expiresAt: true, lastUsedAt: true },
        });
        if (
          !current ||
          current.revokedAt ||
          current.expiresAt <= now ||
          !current.lastUsedAt ||
          current.lastUsedAt <= staleBefore
        ) {
          return null;
        }
      }
    }

    return {
      kind: "service",
      userId: record.createdById,
      organizationId: record.organizationId,
      serviceAccessTokenId: record.id,
      scopes,
    };
  }
}

export const serviceAccessTokenService = new ServiceAccessTokenService();
