import { Router, type Request, type Response } from "express";
import { projectPlanningService } from "../services/project-planning.js";
import { ticketPayload } from "../services/ticket.js";
import { verifyProjectTicketGenerationActionToken } from "../lib/session-action-token.js";

const router = Router();

function readBearer(req: Request): string | null {
  const header = req.header("authorization");
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token?.trim()) return null;
  return token.trim();
}

function projectTicketToken(req: Request, res: Response) {
  const token = readBearer(req);
  const payload = token ? verifyProjectTicketGenerationActionToken(token) : null;
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired Trace action token." });
    return null;
  }
  return payload;
}

function errorResponse(res: Response, error: unknown) {
  res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
}

router.post("/session-actions/project-ticket-generation/ticket", async (req, res) => {
  const token = projectTicketToken(req, res);
  if (!token) return;

  try {
    const ticket = await projectPlanningService.createGeneratedTicketFromDraft({
      organizationId: token.organizationId,
      projectId: token.projectId,
      projectRunId: token.projectRunId,
      generationAttemptId: token.generationAttemptId,
      sessionId: token.sessionId,
      draft: req.body,
      actorType: token.actorType,
      actorId: token.actorId,
    });
    res.json({ ok: true, ticket: ticketPayload(ticket) });
  } catch (error) {
    errorResponse(res, error);
  }
});

router.post("/session-actions/project-ticket-generation/complete", async (req, res) => {
  const token = projectTicketToken(req, res);
  if (!token) return;

  try {
    const generationAttempt = await projectPlanningService.completeGeneratedTicketAttempt({
      organizationId: token.organizationId,
      projectId: token.projectId,
      projectRunId: token.projectRunId,
      generationAttemptId: token.generationAttemptId,
      sessionId: token.sessionId,
      actorType: token.actorType,
      actorId: token.actorId,
    });
    res.json({ ok: true, generationAttempt });
  } catch (error) {
    errorResponse(res, error);
  }
});

router.post("/session-actions/project-ticket-generation/fail", async (req, res) => {
  const token = projectTicketToken(req, res);
  if (!token) return;

  const body =
    req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};
  const error = typeof body.error === "string" ? body.error : "Ticket generation failed.";
  try {
    const generationAttempt = await projectPlanningService.failGeneratedTicketAttempt({
      organizationId: token.organizationId,
      projectId: token.projectId,
      projectRunId: token.projectRunId,
      generationAttemptId: token.generationAttemptId,
      sessionId: token.sessionId,
      error,
      actorType: token.actorType,
      actorId: token.actorId,
    });
    res.json({ ok: true, generationAttempt });
  } catch (caught) {
    errorResponse(res, caught);
  }
});

export { router as sessionActionsRouter };
