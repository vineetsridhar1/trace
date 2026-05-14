import { createHash, randomBytes } from "crypto";
import { prisma } from "../lib/db.js";
import { AuthenticationError, AuthorizationError } from "../lib/errors.js";

export const ASSISTANT_CAPABILITY_SCOPES = [
  "org:read",
  "events:read",
  "sessions:read",
  "tickets:read",
  "suggestions:create",
] as const;

export type AssistantCapabilityScope = (typeof ASSISTANT_CAPABILITY_SCOPES)[number];

export type AssistantCapabilitySubject = {
  organizationId: string;
  assistantSessionId: string;
  agentActorId: string;
  scopes: AssistantCapabilityScope[];
};

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function isAssistantCapabilityScope(scope: string): scope is AssistantCapabilityScope {
  return (ASSISTANT_CAPABILITY_SCOPES as readonly string[]).includes(scope);
}

export class AssistantCapabilityTokenService {
  async issue(input: {
    organizationId: string;
    assistantSessionId: string;
    agentActorId: string;
    ttlMs?: number;
  }): Promise<{ token: string; expiresAt: Date }> {
    const token = `trace_cap_${randomBytes(32).toString("base64url")}`;
    const expiresAt = new Date(Date.now() + (input.ttlMs ?? 1000 * 60 * 60 * 6));

    await prisma.assistantCapabilityToken.create({
      data: {
        organizationId: input.organizationId,
        assistantSessionId: input.assistantSessionId,
        agentActorId: input.agentActorId,
        scopes: [...ASSISTANT_CAPABILITY_SCOPES],
        tokenHash: tokenHash(token),
        expiresAt,
      },
    });

    return { token, expiresAt };
  }

  async authenticate(token: string | null | undefined): Promise<AssistantCapabilitySubject> {
    if (!token) throw new AuthenticationError("Trace capability token required");

    const record = await prisma.assistantCapabilityToken.findUnique({
      where: { tokenHash: tokenHash(token) },
      select: {
        organizationId: true,
        assistantSessionId: true,
        agentActorId: true,
        scopes: true,
        expiresAt: true,
        revokedAt: true,
      },
    });

    if (!record || record.revokedAt || record.expiresAt.getTime() <= Date.now()) {
      throw new AuthenticationError("Trace capability token is invalid or expired");
    }

    return {
      organizationId: record.organizationId,
      assistantSessionId: record.assistantSessionId,
      agentActorId: record.agentActorId,
      scopes: record.scopes.filter(isAssistantCapabilityScope),
    };
  }

  requireScope(subject: AssistantCapabilitySubject, scope: AssistantCapabilityScope): void {
    if (!subject.scopes.includes(scope)) {
      throw new AuthorizationError(`Trace capability token lacks ${scope}`);
    }
  }
}

export const assistantCapabilityTokenService = new AssistantCapabilityTokenService();
