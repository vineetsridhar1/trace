import jwt from "jsonwebtoken";
import { resolveJwtSecret } from "./jwt-secret.js";

const JWT_SECRET = resolveJwtSecret();
const TOKEN_TTL_SECONDS = 6 * 60 * 60;

export type AgentInvocationToken = {
  tokenType: "agent_invocation";
  organizationId: string;
  sessionId: string;
  invocationId: string;
  scope: "artifact:write";
};

export function createAgentInvocationToken(input: {
  organizationId: string;
  sessionId: string;
  invocationId: string;
}): string {
  return jwt.sign(
    {
      tokenType: "agent_invocation",
      organizationId: input.organizationId,
      sessionId: input.sessionId,
      invocationId: input.invocationId,
      scope: "artifact:write",
    } satisfies AgentInvocationToken,
    JWT_SECRET,
    { expiresIn: TOKEN_TTL_SECONDS },
  );
}

export function verifyAgentInvocationToken(token: string): AgentInvocationToken | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as Partial<AgentInvocationToken>;
    if (
      payload.tokenType !== "agent_invocation" ||
      payload.scope !== "artifact:write" ||
      typeof payload.organizationId !== "string" ||
      typeof payload.sessionId !== "string" ||
      typeof payload.invocationId !== "string"
    ) {
      return null;
    }
    return payload as AgentInvocationToken;
  } catch {
    return null;
  }
}
