import jwt from "jsonwebtoken";
import type { ActorType } from "@trace/gql";
import { resolveJwtSecret } from "./jwt-secret.js";

const JWT_SECRET = resolveJwtSecret();

export type ProjectTicketGenerationActionToken = {
  tokenType: "project_ticket_generation_action";
  organizationId: string;
  projectId: string;
  projectRunId: string;
  generationAttemptId: string;
  sessionId: string;
  actorType: ActorType;
  actorId: string;
};

function isActorType(value: unknown): value is ActorType {
  return value === "user" || value === "agent";
}

function stringField(value: Record<string, unknown>, key: string): string | null {
  const field = value[key];
  return typeof field === "string" && field.trim() ? field : null;
}

export function createProjectTicketGenerationActionToken(
  payload: ProjectTicketGenerationActionToken,
): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "2h" });
}

export function verifyProjectTicketGenerationActionToken(
  token: string,
): ProjectTicketGenerationActionToken | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as unknown;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    const value = payload as Record<string, unknown>;
    if (value.tokenType !== "project_ticket_generation_action") return null;
    if (!isActorType(value.actorType)) return null;

    const organizationId = stringField(value, "organizationId");
    const projectId = stringField(value, "projectId");
    const projectRunId = stringField(value, "projectRunId");
    const generationAttemptId = stringField(value, "generationAttemptId");
    const sessionId = stringField(value, "sessionId");
    const actorId = stringField(value, "actorId");
    if (
      !organizationId ||
      !projectId ||
      !projectRunId ||
      !generationAttemptId ||
      !sessionId ||
      !actorId
    ) {
      return null;
    }

    return {
      tokenType: "project_ticket_generation_action",
      organizationId,
      projectId,
      projectRunId,
      generationAttemptId,
      sessionId,
      actorType: value.actorType,
      actorId,
    };
  } catch {
    return null;
  }
}
