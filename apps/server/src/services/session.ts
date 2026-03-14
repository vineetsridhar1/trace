import type { StartSessionInput, ActorType } from "@trace/gql";
import { prisma } from "../lib/db.js";
import { eventService } from "./event.js";

export type StartSessionServiceInput = StartSessionInput & {
  organizationId: string;
  createdById: string;
};

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
        include: { createdBy: true, repo: true, channel: true },
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

  async pause(_id: string) {
    throw new Error("Not implemented");
  }

  async resume(_id: string) {
    throw new Error("Not implemented");
  }

  async terminate(_id: string) {
    throw new Error("Not implemented");
  }

  async sendMessage(_sessionId: string, _text: string, _actorType: ActorType, _actorId: string) {
    throw new Error("Not implemented");
  }
}

export const sessionService = new SessionService();
