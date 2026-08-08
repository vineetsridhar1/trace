import jwt from "jsonwebtoken";
import { prisma } from "./db.js";
import { resolveJwtSecret } from "./jwt-secret.js";

const JWT_SECRET = resolveJwtSecret();
const TOKEN_TTL_SECONDS = 6 * 60 * 60;
const TOKEN_AUDIENCE = "trace-session-client";

export const AGENT_INVOCATION_CAPABILITIES = [
  "artifact:write",
  "session:read",
  "session:events",
  "session:send",
] as const;

export type AgentInvocationCapability = (typeof AGENT_INVOCATION_CAPABILITIES)[number];

export type AgentInvocationToken = {
  tokenType: "agent_invocation";
  organizationId: string;
  sessionId: string;
  sessionGroupId: string | null;
  invocationId: string;
  capabilities: AgentInvocationCapability[];
};

export type AgentInvocationAuthSubject = AgentInvocationToken & {
  kind: "agent";
  userId: string;
};

export function createAgentInvocationToken(input: {
  organizationId: string;
  sessionId: string;
  sessionGroupId?: string | null;
  invocationId: string;
}): string {
  return jwt.sign(
    {
      tokenType: "agent_invocation",
      organizationId: input.organizationId,
      sessionId: input.sessionId,
      sessionGroupId: input.sessionGroupId ?? null,
      invocationId: input.invocationId,
      capabilities: [...AGENT_INVOCATION_CAPABILITIES],
    } satisfies AgentInvocationToken,
    JWT_SECRET,
    { expiresIn: TOKEN_TTL_SECONDS, audience: TOKEN_AUDIENCE },
  );
}

function hasValidCapabilities(value: unknown): value is AgentInvocationCapability[] {
  return (
    Array.isArray(value) &&
    value.every(
      (capability) =>
        typeof capability === "string" &&
        AGENT_INVOCATION_CAPABILITIES.includes(capability as AgentInvocationCapability),
    )
  );
}

export function verifyAgentInvocationToken(token: string): AgentInvocationToken | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET, {
      audience: TOKEN_AUDIENCE,
    }) as Partial<AgentInvocationToken>;
    if (
      payload.tokenType !== "agent_invocation" ||
      typeof payload.organizationId !== "string" ||
      typeof payload.sessionId !== "string" ||
      (typeof payload.sessionGroupId !== "string" && payload.sessionGroupId !== null) ||
      typeof payload.invocationId !== "string" ||
      !hasValidCapabilities(payload.capabilities)
    ) {
      return null;
    }
    return payload as AgentInvocationToken;
  } catch {
    return null;
  }
}

export async function authenticateAgentInvocationToken(
  token: string,
): Promise<AgentInvocationAuthSubject | null> {
  const payload = verifyAgentInvocationToken(token);
  if (!payload) return null;

  const session = await prisma.session.findFirst({
    where: {
      id: payload.sessionId,
      organizationId: payload.organizationId,
      sessionGroupId: payload.sessionGroupId,
      activeInvocationId: payload.invocationId,
      agentStatus: { notIn: ["failed", "stopped"] },
    },
    select: { createdById: true },
  });
  if (!session) return null;

  return {
    ...payload,
    kind: "agent",
    userId: session.createdById,
  };
}
