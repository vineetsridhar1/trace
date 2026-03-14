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

    // Update status to active
    await prisma.session.update({
      where: { id },
      data: { status: "active" },
    });

    return prisma.session.findUniqueOrThrow({
      where: { id },
      include: SESSION_INCLUDE,
    });
  }

  async pause(_id: string) {
    throw new Error("Not implemented");
  }

  async resume(_id: string) {
    throw new Error("Not implemented");
  }

  async terminate(id: string) {
    sessionRouter.send(id, { type: "terminate", sessionId: id });

    const session = await prisma.session.update({
      where: { id },
      data: { status: "completed" },
      include: SESSION_INCLUDE,
    });

    await eventService.create({
      organizationId: session.organizationId,
      scopeType: "session",
      scopeId: id,
      eventType: "session_terminated",
      payload: { sessionId: id },
      actorType: "system",
      actorId: "system",
    });

    return session;
  }

  async sendMessage(sessionId: string, text: string, actorType: ActorType, actorId: string) {
    const session = await prisma.session.update({
      where: { id: sessionId },
      data: { updatedAt: new Date() },
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
