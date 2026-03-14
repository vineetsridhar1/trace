import type { CreateTicketInput, UpdateTicketInput, ActorType } from "@trace/gql";
import { prisma } from "../lib/db.js";
import { eventService } from "./event.js";

export type CreateTicketServiceInput = CreateTicketInput & {
  actorType: ActorType;
  actorId: string;
};

const TICKET_INCLUDE = {
  channel: true,
  projects: { include: { project: true } },
  sessions: { include: { session: true } },
} as const;

export class TicketService {
  async create(input: CreateTicketServiceInput) {
    const [ticket] = await prisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.create({
        data: {
          title: input.title,
          description: input.description ?? "",
          priority: input.priority ?? "medium",
          labels: input.labels ?? [],
          organizationId: input.organizationId,
          channelId: input.channelId ?? undefined,
          ...(input.projectId && {
            projects: { create: { projectId: input.projectId } },
          }),
        },
        include: TICKET_INCLUDE,
      });

      const event = await eventService.create({
        organizationId: input.organizationId,
        scopeType: "ticket",
        scopeId: ticket.id,
        eventType: "ticket_created",
        payload: {
          ticketId: ticket.id,
          title: ticket.title,
          priority: ticket.priority,
        },
        actorType: input.actorType,
        actorId: input.actorId,
      }, tx);

      return [ticket, event] as const;
    });

    return ticket;
  }

  async update(id: string, input: UpdateTicketInput, actorType: ActorType, actorId: string) {
    const existing = await prisma.ticket.findUniqueOrThrow({
      where: { id },
      select: { organizationId: true, status: true },
    });

    const ticket = await prisma.ticket.update({
      where: { id },
      data: {
        ...(input.title !== undefined && input.title !== null && { title: input.title }),
        ...(input.description !== undefined && input.description !== null && { description: input.description }),
        ...(input.status !== undefined && input.status !== null && { status: input.status }),
        ...(input.priority !== undefined && input.priority !== null && { priority: input.priority }),
        ...(input.labels !== undefined && input.labels !== null && { labels: input.labels }),
      },
      include: TICKET_INCLUDE,
    });

    await eventService.create({
      organizationId: existing.organizationId,
      scopeType: "ticket",
      scopeId: id,
      eventType: "ticket_updated",
      payload: {
        ticketId: id,
        changes: input,
        previousStatus: existing.status,
      },
      actorType,
      actorId,
    });

    return ticket;
  }

  async addComment(ticketId: string, text: string, actorType: ActorType, actorId: string) {
    const ticket = await prisma.ticket.findUniqueOrThrow({
      where: { id: ticketId },
      select: { organizationId: true },
    });

    return eventService.create({
      organizationId: ticket.organizationId,
      scopeType: "ticket",
      scopeId: ticketId,
      eventType: "ticket_commented",
      payload: { text },
      actorType,
      actorId,
    });
  }
}

export const ticketService = new TicketService();
