import express from "express";
import { prisma } from "../lib/db.js";
import { assistantCapabilityTokenService } from "../services/assistant-capability-token.js";
import { suggestedActionService } from "../services/suggested-action.js";
import { toGraphQLError } from "../lib/errors.js";

export const agentToolsRouter = express.Router();

function bearerToken(req: express.Request): string | null {
  const header = req.header("authorization");
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

function bodyRecord(req: express.Request): Record<string, unknown> {
  return req.body && typeof req.body === "object" && !Array.isArray(req.body)
    ? (req.body as Record<string, unknown>)
    : {};
}

function sendError(res: express.Response, error: unknown): void {
  const gqlError = toGraphQLError(error);
  const code = gqlError.extensions.code;
  const status =
    code === "UNAUTHENTICATED" ? 401 : code === "FORBIDDEN" ? 403 : code === "BAD_USER_INPUT" ? 400 : 500;
  res.status(status).json({ error: gqlError.message });
}

agentToolsRouter.use(async (req, res, next) => {
  try {
    res.locals.traceCapability = await assistantCapabilityTokenService.authenticate(
      bearerToken(req),
    );
    next();
  } catch (error) {
    sendError(res, error);
  }
});

agentToolsRouter.get("/org/recent", async (_req, res) => {
  try {
    const subject = res.locals.traceCapability as Awaited<
      ReturnType<typeof assistantCapabilityTokenService.authenticate>
    >;
    assistantCapabilityTokenService.requireScope(subject, "events:read");
    const limitRaw = Number(_req.query.limit ?? 50);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 100) : 50;
    const events = await prisma.event.findMany({
      where: { organizationId: subject.organizationId },
      orderBy: { timestamp: "desc" },
      take: limit,
    });
    res.json({ events });
  } catch (error) {
    sendError(res, error);
  }
});

agentToolsRouter.get("/org/search", async (req, res) => {
  try {
    const subject = res.locals.traceCapability as Awaited<
      ReturnType<typeof assistantCapabilityTokenService.authenticate>
    >;
    assistantCapabilityTokenService.requireScope(subject, "org:read");
    const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const limitRaw = Number(req.query.limit ?? 25);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 50) : 25;
    if (!query) {
      res.json({ sessions: [], tickets: [], events: [] });
      return;
    }

    const [sessions, tickets, recentEvents] = await Promise.all([
      prisma.session.findMany({
        where: {
          organizationId: subject.organizationId,
          OR: [{ name: { contains: query, mode: "insensitive" } }],
        },
        take: limit,
        orderBy: { updatedAt: "desc" },
      }),
      prisma.ticket.findMany({
        where: {
          organizationId: subject.organizationId,
          OR: [
            { title: { contains: query, mode: "insensitive" } },
            { description: { contains: query, mode: "insensitive" } },
          ],
        },
        take: limit,
        orderBy: { updatedAt: "desc" },
      }),
      prisma.event.findMany({
        where: { organizationId: subject.organizationId },
        take: 200,
        orderBy: { timestamp: "desc" },
      }),
    ]);
    const lowerQuery = query.toLowerCase();
    const events = recentEvents
      .filter((event) => JSON.stringify(event).toLowerCase().includes(lowerQuery))
      .slice(0, limit);
    res.json({ sessions, tickets, events });
  } catch (error) {
    sendError(res, error);
  }
});

agentToolsRouter.get("/session/:sessionId/context", async (req, res) => {
  try {
    const subject = res.locals.traceCapability as Awaited<
      ReturnType<typeof assistantCapabilityTokenService.authenticate>
    >;
    assistantCapabilityTokenService.requireScope(subject, "sessions:read");
    const session = await prisma.session.findFirst({
      where: { id: req.params.sessionId, organizationId: subject.organizationId },
      include: { repo: true, channel: true, sessionGroup: true },
    });
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    const events = await prisma.event.findMany({
      where: {
        organizationId: subject.organizationId,
        scopeType: "session",
        scopeId: session.id,
      },
      orderBy: { timestamp: "desc" },
      take: 100,
    });
    res.json({ session, events: events.reverse() });
  } catch (error) {
    sendError(res, error);
  }
});

agentToolsRouter.get("/ticket/:ticketId", async (req, res) => {
  try {
    const subject = res.locals.traceCapability as Awaited<
      ReturnType<typeof assistantCapabilityTokenService.authenticate>
    >;
    assistantCapabilityTokenService.requireScope(subject, "tickets:read");
    const ticket = await prisma.ticket.findFirst({
      where: { id: req.params.ticketId, organizationId: subject.organizationId },
      include: {
        channel: true,
        projects: { include: { project: true } },
        assignees: { include: { user: true } },
      },
    });
    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }
    res.json({ ticket });
  } catch (error) {
    sendError(res, error);
  }
});

agentToolsRouter.post("/suggest/send-message", async (req, res) => {
  try {
    const subject = res.locals.traceCapability as Awaited<
      ReturnType<typeof assistantCapabilityTokenService.authenticate>
    >;
    assistantCapabilityTokenService.requireScope(subject, "suggestions:create");
    const body = bodyRecord(req);
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : null;
    const messageBody = typeof body.body === "string" ? body.body : null;
    const rationale = typeof body.rationale === "string" ? body.rationale : null;
    const action = await suggestedActionService.create({
      organizationId: subject.organizationId,
      assistantSessionId: subject.assistantSessionId,
      actionType: "send_session_message",
      targetType: "session",
      targetId: sessionId,
      actionInput: { body: messageBody },
      rationale,
      proposedByActorType: "agent",
      proposedByActorId: subject.agentActorId,
    });
    res.json({ suggestedAction: action });
  } catch (error) {
    sendError(res, error);
  }
});

agentToolsRouter.post("/suggest/create-session", async (req, res) => {
  try {
    const subject = res.locals.traceCapability as Awaited<
      ReturnType<typeof assistantCapabilityTokenService.authenticate>
    >;
    assistantCapabilityTokenService.requireScope(subject, "suggestions:create");
    const body = bodyRecord(req);
    const title = typeof body.title === "string" ? body.title : null;
    const prompt = typeof body.prompt === "string" ? body.prompt : null;
    const rationale = typeof body.rationale === "string" ? body.rationale : null;
    const action = await suggestedActionService.create({
      organizationId: subject.organizationId,
      assistantSessionId: subject.assistantSessionId,
      actionType: "create_session",
      targetType: "organization",
      targetId: subject.organizationId,
      actionInput: { title, prompt },
      rationale,
      proposedByActorType: "agent",
      proposedByActorId: subject.agentActorId,
    });
    res.json({ suggestedAction: action });
  } catch (error) {
    sendError(res, error);
  }
});
