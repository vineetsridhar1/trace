import type { StartSessionInput, ActorType } from "@trace/gql";
import { prisma } from "../lib/db.js";
import { eventService } from "./event.js";
import { sessionRouter } from "../lib/session-router.js";

export type StartSessionServiceInput = StartSessionInput & {
  organizationId: string;
  createdById: string;
};

const SESSION_INCLUDE = { createdBy: true, repo: true, channel: true } as const;

export class SessionService {
  async start(input: StartSessionServiceInput) {
    const name = input.prompt
      ? input.prompt.slice(0, 80)
      : `Session ${new Date().toLocaleString()}`;

    const [session] = await prisma.$transaction(async (tx) => {
      const session = await tx.session.create({
        data: {
          name,
          tool: input.tool,
          hosting: input.hosting,
          organizationId: input.organizationId,
          createdById: input.createdById,
          repoId: input.repoId ?? undefined,
          branch: input.branch ?? undefined,
          channelId: input.channelId ?? undefined,
          ...(input.projectId && {
            projects: { create: { projectId: input.projectId } },
          }),
        },
        include: SESSION_INCLUDE,
      });

      const event = await eventService.create({
        organizationId: input.organizationId,
        scopeType: "session",
        scopeId: session.id,
        eventType: "session_started",
        payload: {
          sessionId: session.id,
          name: session.name,
          tool: session.tool,
          hosting: session.hosting,
          prompt: input.prompt ?? null,
        },
        actorType: "user",
        actorId: input.createdById,
      }, tx);

      return [session, event] as const;
    });

    return session;
  }

  async run(id: string, prompt?: string | null) {
    const session = await prisma.session.findUniqueOrThrow({
      where: { id },
      include: SESSION_INCLUDE,
    });

    // If no prompt provided, retrieve the original prompt from the session_started event
    let resolvedPrompt = prompt;
    if (!resolvedPrompt) {
      const startEvent = await prisma.event.findFirst({
        where: { scopeId: id, scopeType: "session", eventType: "session_started" },
        orderBy: { timestamp: "asc" },
      });
      if (startEvent) {
        const payload = startEvent.payload as Record<string, unknown>;
        resolvedPrompt = (payload.prompt as string) ?? null;
      }
    }

    const command = {
      type: "run" as const,
      sessionId: id,
      prompt: resolvedPrompt ?? undefined,
      tool: session.tool,
    };

    const sent = sessionRouter.send(id, command);

    if (!sent) {
      // Try binding to a default bridge and retry
      const bridge = sessionRouter.getDefaultBridge();
      if (bridge) {
        sessionRouter.bindSession(id, bridge.id);
        sessionRouter.send(id, command);
      }
    }

    // Update status to active and return with includes
    return prisma.session.update({
      where: { id },
      data: { status: "active" },
      include: SESSION_INCLUDE,
    });
  }

  async pause(id: string, actorType: ActorType = "system", actorId: string = "system") {
    return this.transition(id, "pause", "paused", "session_paused", actorType, actorId);
  }

  async resume(id: string, actorType: ActorType = "system", actorId: string = "system") {
    return this.transition(id, "resume", "active", "session_resumed", actorType, actorId);
  }

  async terminate(id: string, actorType: ActorType = "system", actorId: string = "system") {
    return this.transition(id, "terminate", "completed", "session_terminated", actorType, actorId);
  }

  private async transition(
    id: string,
    command: "pause" | "resume" | "terminate",
    newStatus: string,
    eventType: string,
    actorType: ActorType,
    actorId: string,
  ) {
    sessionRouter.send(id, { type: command, sessionId: id });

    const session = await prisma.session.update({
      where: { id },
      data: { status: newStatus as any },
      include: SESSION_INCLUDE,
    });

    await eventService.create({
      organizationId: session.organizationId,
      scopeType: "session",
      scopeId: id,
      eventType: eventType as any,
      payload: { sessionId: id },
      actorType,
      actorId,
    });

    return session;
  }

  async updateTool(sessionId: string, tool: string, actorType: ActorType, actorId: string) {
    const session = await prisma.session.update({
      where: { id: sessionId },
      data: { tool: tool as any },
      include: SESSION_INCLUDE,
    });

    await eventService.create({
      organizationId: session.organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "session_output",
      payload: { type: "tool_changed", tool },
      actorType,
      actorId,
    });

    return session;
  }

  async linkToTicket(sessionId: string, ticketId: string, actorType: ActorType, actorId: string) {
    const session = await prisma.session.update({
      where: { id: sessionId },
      data: { tickets: { create: { ticketId } } },
      include: SESSION_INCLUDE,
    });

    await eventService.create({
      organizationId: session.organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "entity_linked",
      payload: { sessionId, ticketId },
      actorType,
      actorId,
    });

    return session;
  }

  async complete(id: string) {
    const session = await prisma.session.update({
      where: { id },
      data: { status: "completed" },
      select: { organizationId: true },
    });

    await eventService.create({
      organizationId: session.organizationId,
      scopeType: "session",
      scopeId: id,
      eventType: "session_terminated",
      payload: { sessionId: id, reason: "bridge_complete" },
      actorType: "system",
      actorId: "system",
    });
  }

  async sendMessage(sessionId: string, text: string, actorType: ActorType, actorId: string) {
    const session = await prisma.session.findUniqueOrThrow({
      where: { id: sessionId },
      select: { organizationId: true },
    });

    const event = await eventService.create({
      organizationId: session.organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "message_sent",
      payload: { text },
      actorType,
      actorId,
    });

    // Forward to bridge so Claude Code receives the message
    sessionRouter.send(sessionId, {
      type: "send",
      sessionId,
      prompt: text,
    });

    return event;
  }
}

export const sessionService = new SessionService();
