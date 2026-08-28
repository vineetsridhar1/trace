import { createHash, randomBytes } from "crypto";
import type { IntegrationCredentialScope } from "@trace/gql";
import { prisma } from "../lib/db.js";
import { orgMemberService } from "./org-member.js";
import { ValidationError } from "../lib/errors.js";
import { eventService } from "./event.js";

const TOKEN_PREFIX = "trc_int_";
const SECRET_BYTES = 32;
const MAX_NAME_LENGTH = 120;
const MAX_ALLOWED_CHANNELS = 100;
const LAST_USED_WRITE_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_SCOPES: IntegrationCredentialScope[] = ["sessions_create", "sessions_read"];

export type AuthenticatedIntegrationCredential = {
  id: string;
  organizationId: string;
  createdById: string;
  scopes: string[];
  allowedChannelIds: string[];
};

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function createToken(): { token: string; tokenHash: string } {
  const token = `${TOKEN_PREFIX}${randomBytes(SECRET_BYTES).toString("base64url")}`;
  return { token, tokenHash: hashToken(token) };
}

export class IntegrationCredentialService {
  async create(input: {
    organizationId: string;
    name: string;
    allowedChannelIds: string[];
    expiresAt?: string | null;
    actorId: string;
  }) {
    await orgMemberService.assertAdmin(input.actorId, input.organizationId);

    const name = input.name.trim();
    if (!name || name.length > MAX_NAME_LENGTH) {
      throw new ValidationError(`Name must be between 1 and ${MAX_NAME_LENGTH} characters`);
    }

    const allowedChannelIds = [...new Set(input.allowedChannelIds.map((id) => id.trim()))].filter(
      Boolean,
    );
    if (allowedChannelIds.length === 0 || allowedChannelIds.length > MAX_ALLOWED_CHANNELS) {
      throw new ValidationError(
        `At least one and at most ${MAX_ALLOWED_CHANNELS} allowed channels are required`,
      );
    }

    const channels = await prisma.channel.findMany({
      where: {
        id: { in: allowedChannelIds },
        organizationId: input.organizationId,
        type: "coding",
        members: { some: { userId: input.actorId, leftAt: null } },
      },
      select: { id: true },
    });
    if (channels.length !== allowedChannelIds.length) {
      throw new ValidationError(
        "Every allowed channel must be a coding channel in the organization",
      );
    }

    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    if (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date())) {
      throw new ValidationError("Expiration must be a valid future date");
    }

    const { token, tokenHash } = createToken();
    const result = await prisma.$transaction(async (tx) => {
      const credential = await tx.integrationCredential.create({
        data: {
          name,
          organizationId: input.organizationId,
          createdById: input.actorId,
          tokenHash,
          scopes: DEFAULT_SCOPES,
          allowedChannelIds,
          expiresAt,
        },
      });
      const event = await eventService.create(
        {
          organizationId: input.organizationId,
          scopeType: "system",
          scopeId: input.organizationId,
          eventType: "integration_credential_created",
          payload: {
            credentialId: credential.id,
            name: credential.name,
            scopes: credential.scopes,
            allowedChannelIds: credential.allowedChannelIds,
            expiresAt: credential.expiresAt?.toISOString() ?? null,
          },
          actorType: "user",
          actorId: input.actorId,
          deferPublish: true,
        },
        tx,
      );
      return { credential, event };
    });
    eventService.publishCreated(result.event);

    return { credential: result.credential, token };
  }

  async list(organizationId: string, actorId: string) {
    await orgMemberService.assertAdmin(actorId, organizationId);
    return prisma.integrationCredential.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
    });
  }

  async revoke(id: string, organizationId: string, actorId: string) {
    await orgMemberService.assertAdmin(actorId, organizationId);
    const credential = await prisma.integrationCredential.findFirst({
      where: { id, organizationId },
    });
    if (!credential) throw new ValidationError("Integration credential not found");
    if (credential.revokedAt) return credential;
    const result = await prisma.$transaction(async (tx) => {
      const revokedAt = new Date();
      const updated = await tx.integrationCredential.update({
        where: { id },
        data: { revokedAt },
      });
      const event = await eventService.create(
        {
          organizationId,
          scopeType: "system",
          scopeId: organizationId,
          eventType: "integration_credential_revoked",
          payload: { credentialId: id, revokedAt: revokedAt.toISOString() },
          actorType: "user",
          actorId,
          deferPublish: true,
        },
        tx,
      );
      return { credential: updated, event };
    });
    eventService.publishCreated(result.event);
    return result.credential;
  }

  async authenticate(
    token: string,
    requiredScope: IntegrationCredentialScope,
  ): Promise<AuthenticatedIntegrationCredential | null> {
    const trimmed = token.trim();
    if (!trimmed.startsWith(TOKEN_PREFIX)) return null;

    const now = new Date();
    const credential = await prisma.integrationCredential.findUnique({
      where: { tokenHash: hashToken(trimmed) },
      select: {
        id: true,
        organizationId: true,
        createdById: true,
        scopes: true,
        allowedChannelIds: true,
        revokedAt: true,
        expiresAt: true,
        lastUsedAt: true,
        createdBy: {
          select: {
            orgMemberships: {
              select: { organizationId: true },
            },
          },
        },
      },
    });
    if (
      !credential ||
      credential.revokedAt ||
      (credential.expiresAt && credential.expiresAt <= now) ||
      !credential.createdBy.orgMemberships.some(
        (membership) => membership.organizationId === credential.organizationId,
      ) ||
      !credential.scopes.includes(requiredScope)
    ) {
      return null;
    }

    if (
      !credential.lastUsedAt ||
      credential.lastUsedAt.getTime() <= now.getTime() - LAST_USED_WRITE_INTERVAL_MS
    ) {
      const touched = await prisma.integrationCredential.updateMany({
        where: {
          id: credential.id,
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        data: { lastUsedAt: now },
      });
      if (touched.count !== 1) return null;
    }

    return credential;
  }
}

export const integrationCredentialService = new IntegrationCredentialService();
