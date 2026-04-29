import jwt from "jsonwebtoken";
import { resolveJwtSecret } from "../lib/jwt-secret.js";

const RUNTIME_TOKEN_TYPE = "ultraplan_runtime_action";
const DEFAULT_ALLOWED_ACTIONS = [
  "ticket.create",
  "ticket.update",
  "ticket.addComment",
  "ticket.updateAcceptanceCriteria",
  "ticket.updateTestPlan",
  "ticket.addDependency",
  "ticket.reorder",
  "ultraplan.addPlannedTicket",
  "ultraplan.updatePlannedTicket",
  "ultraplan.reorderPlannedTickets",
  "ultraplan.createTicketExecution",
  "ultraplan.startWorker",
  "ultraplan.sendWorkerMessage",
  "ultraplan.requestHumanGate",
  "ultraplan.markExecutionReady",
  "ultraplan.markExecutionBlocked",
  "ultraplan.completeControllerRun",
  "integration.mergeTicketBranch",
  "integration.rebaseTicketBranch",
  "integration.reportConflict",
] as const;

export type UltraplanRuntimeTokenClaims = {
  tokenType: typeof RUNTIME_TOKEN_TYPE;
  organizationId: string;
  ultraplanId: string;
  sessionGroupId: string;
  controllerRunId: string;
  sessionId: string;
  allowedActions: string[];
};

export function mintUltraplanRuntimeToken(
  input: Omit<UltraplanRuntimeTokenClaims, "tokenType" | "allowedActions">,
) {
  return jwt.sign(
    {
      tokenType: RUNTIME_TOKEN_TYPE,
      organizationId: input.organizationId,
      ultraplanId: input.ultraplanId,
      sessionGroupId: input.sessionGroupId,
      controllerRunId: input.controllerRunId,
      sessionId: input.sessionId,
      allowedActions: [...DEFAULT_ALLOWED_ACTIONS],
    } satisfies UltraplanRuntimeTokenClaims,
    resolveJwtSecret(),
    { expiresIn: "2h" },
  );
}

export function verifyUltraplanRuntimeToken(token: string): UltraplanRuntimeTokenClaims | null {
  try {
    const payload = jwt.verify(token, resolveJwtSecret()) as unknown;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    const claims = payload as Record<string, unknown>;
    if (
      claims.tokenType !== RUNTIME_TOKEN_TYPE ||
      typeof claims.organizationId !== "string" ||
      typeof claims.ultraplanId !== "string" ||
      typeof claims.sessionGroupId !== "string" ||
      typeof claims.controllerRunId !== "string" ||
      typeof claims.sessionId !== "string" ||
      !Array.isArray(claims.allowedActions) ||
      !claims.allowedActions.every((action) => typeof action === "string")
    ) {
      return null;
    }
    return {
      tokenType: RUNTIME_TOKEN_TYPE,
      organizationId: claims.organizationId,
      ultraplanId: claims.ultraplanId,
      sessionGroupId: claims.sessionGroupId,
      controllerRunId: claims.controllerRunId,
      sessionId: claims.sessionId,
      allowedActions: claims.allowedActions,
    };
  } catch {
    return null;
  }
}

export function defaultTraceApiUrl() {
  return (
    process.env.TRACE_SERVER_PUBLIC_URL ??
    `http://localhost:${4000 + Number(process.env.TRACE_PORT || 0)}`
  );
}
