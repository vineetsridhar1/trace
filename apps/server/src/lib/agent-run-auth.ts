import jwt from "jsonwebtoken";
import { resolveJwtSecret } from "./jwt-secret.js";

const JWT_SECRET = resolveJwtSecret();
const AGENT_RUN_TOKEN_TTL_SECONDS = 6 * 60 * 60;

export type AgentRunTokenPayload = {
  tokenType: "agent_run";
  organizationId: string;
  runId: string;
  sessionId: string;
  scopes: ["visual-plan:write"];
};

export function createAgentRunToken(input: {
  organizationId: string;
  runId: string;
  sessionId: string;
}): string {
  return jwt.sign(
    {
      tokenType: "agent_run",
      organizationId: input.organizationId,
      runId: input.runId,
      sessionId: input.sessionId,
      scopes: ["visual-plan:write"],
    } satisfies AgentRunTokenPayload,
    JWT_SECRET,
    { expiresIn: AGENT_RUN_TOKEN_TTL_SECONDS },
  );
}

export function verifyAgentRunToken(token: string): AgentRunTokenPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as unknown as AgentRunTokenPayload;
    if (
      !payload ||
      typeof payload !== "object" ||
      payload.tokenType !== "agent_run" ||
      typeof payload.organizationId !== "string" ||
      typeof payload.runId !== "string" ||
      typeof payload.sessionId !== "string" ||
      !Array.isArray(payload.scopes) ||
      payload.scopes.length !== 1 ||
      payload.scopes[0] !== "visual-plan:write"
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
