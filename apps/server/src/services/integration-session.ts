import type { AuthenticatedIntegrationCredential } from "./integration-credential.js";
import { prisma } from "../lib/db.js";
import { ValidationError } from "../lib/errors.js";
import { sessionService } from "./session.js";

const MAX_PROMPT_LENGTH = 100_000;
const MAX_IDEMPOTENCY_KEY_LENGTH = 120;

type IntegrationSessionView = {
  id: string;
  name: string;
  agentStatus: string;
  sessionStatus: string;
  sessionGroupId: string | null;
  channelId: string | null;
  prUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  error: string | null;
  url: string | null;
};

function sessionUrl(input: {
  id: string;
  channelId: string | null;
  sessionGroupId: string | null;
}): string | null {
  const base = process.env.TRACE_WEB_URL?.replace(/\/$/, "");
  if (!base) return null;
  const groupPart = input.sessionGroupId ? `/g/${input.sessionGroupId}` : "";
  const sessionPart = `/s/${input.id}`;
  if (input.channelId && input.sessionGroupId) {
    return `${base}/c/${input.channelId}${groupPart}${sessionPart}`;
  }
  return `${base}${groupPart}${sessionPart}`;
}

function connectionError(connection: unknown): string | null {
  if (!connection || typeof connection !== "object" || Array.isArray(connection)) return null;
  const connectionRecord = connection as Record<string, unknown>;
  const error = connectionRecord.lastError ?? connectionRecord.error;
  return typeof error === "string" && error.trim() ? error : null;
}

function view(session: {
  id: string;
  name: string;
  agentStatus: string;
  sessionStatus: string;
  sessionGroupId: string | null;
  channelId: string | null;
  prUrl: string | null;
  connection: unknown;
  createdAt: Date;
  updatedAt: Date;
  sessionGroup?: { setupError: string | null } | null;
}): IntegrationSessionView {
  return {
    id: session.id,
    name: session.name,
    agentStatus: session.agentStatus,
    sessionStatus: session.sessionStatus,
    sessionGroupId: session.sessionGroupId,
    channelId: session.channelId,
    prUrl: session.prUrl,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    error: session.sessionGroup?.setupError ?? connectionError(session.connection),
    url: sessionUrl(session),
  };
}

export class IntegrationSessionService {
  async create(
    credential: AuthenticatedIntegrationCredential,
    input: { prompt: string; channelId: string; idempotencyKey: string },
  ): Promise<IntegrationSessionView> {
    const prompt = input.prompt.trim();
    if (!prompt || prompt.length > MAX_PROMPT_LENGTH) {
      throw new ValidationError(`Prompt must be between 1 and ${MAX_PROMPT_LENGTH} characters`);
    }
    const channelId = input.channelId.trim();
    if (!channelId || !credential.allowedChannelIds.includes(channelId)) {
      throw new ValidationError("Channel is not allowed for this integration credential");
    }
    const idempotencyKey = input.idempotencyKey.trim();
    if (!idempotencyKey || idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
      throw new ValidationError(
        `Idempotency key must be between 1 and ${MAX_IDEMPOTENCY_KEY_LENGTH} characters`,
      );
    }

    const session = await sessionService.start({
      kind: "coding",
      hosting: "cloud",
      channelId,
      prompt,
      clientMutationId: `integration:${credential.id}:${idempotencyKey}`,
      organizationId: credential.organizationId,
      createdById: credential.createdById,
      actorType: "agent",
      clientSource: "integration",
      integrationCredentialId: credential.id,
    });

    return view(session);
  }

  async get(
    credential: AuthenticatedIntegrationCredential,
    sessionId: string,
  ): Promise<IntegrationSessionView | null> {
    const session = await prisma.session.findFirst({
      where: {
        id: sessionId,
        organizationId: credential.organizationId,
        integrationCredentialId: credential.id,
      },
      select: {
        id: true,
        name: true,
        agentStatus: true,
        sessionStatus: true,
        sessionGroupId: true,
        channelId: true,
        prUrl: true,
        connection: true,
        createdAt: true,
        updatedAt: true,
        sessionGroup: { select: { setupError: true } },
      },
    });
    return session ? view(session) : null;
  }
}

export const integrationSessionService = new IntegrationSessionService();
