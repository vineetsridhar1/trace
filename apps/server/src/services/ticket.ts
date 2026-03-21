import type { CreateTicketInput, UpdateTicketInput, ActorType, EntityType } from "@trace/gql";
import { prisma } from "../lib/db.js";
import { eventService } from "./event.js";

export type CreateTicketServiceInput = CreateTicketInput & {
  actorType: ActorType;
  actorId: string;
};

const TICKET_INCLUDE = {
  channel: true,
  createdBy: true,
  projects: { include: { project: true } },
  assignees: { include: { user: true } },
  links: true,
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
          createdById: input.actorId,
          channelId: input.channelId ?? undefined,
          ...(input.projectId && {
            projects: { create: { projectId: input.projectId } },
          }),
          ...(input.assigneeIds?.length && {
            assignees: {
              create: input.assigneeIds.map((userId) => ({ userId })),
            },
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

  async assign({ ticketId, userId, actorType, actorId }: {
    ticketId: string;
    userId: string;
    actorType: ActorType;
    actorId: string;
  }) {
    const ticket = await prisma.$transaction(async (tx) => {
      await tx.ticketAssignee.create({
        data: { ticketId, userId },
      });

      const ticket = await tx.ticket.findUniqueOrThrow({
        where: { id: ticketId },
        include: TICKET_INCLUDE,
      });

      await eventService.create({
        organizationId: ticket.organizationId,
        scopeType: "ticket",
        scopeId: ticketId,
        eventType: "ticket_assigned",
        payload: { ticketId, userId },
        actorType,
        actorId,
      }, tx);

      return ticket;
    });

    return ticket;
  }

  async unassign({ ticketId, userId, actorType, actorId }: {
    ticketId: string;
    userId: string;
    actorType: ActorType;
    actorId: string;
  }) {
    const ticket = await prisma.$transaction(async (tx) => {
      await tx.ticketAssignee.delete({
        where: { ticketId_userId: { ticketId, userId } },
      });

      const ticket = await tx.ticket.findUniqueOrThrow({
        where: { id: ticketId },
        include: TICKET_INCLUDE,
      });

      await eventService.create({
        organizationId: ticket.organizationId,
        scopeType: "ticket",
        scopeId: ticketId,
        eventType: "ticket_unassigned",
        payload: { ticketId, userId },
        actorType,
        actorId,
      }, tx);

      return ticket;
    });

    return ticket;
  }

  async link({ ticketId, entityType, entityId, actorType, actorId }: {
    ticketId: string;
    entityType: EntityType;
    entityId: string;
    actorType: ActorType;
    actorId: string;
  }) {
    const ticket = await prisma.$transaction(async (tx) => {
      await tx.ticketLink.create({
        data: { ticketId, entityType, entityId },
      });

      const ticket = await tx.ticket.findUniqueOrThrow({
        where: { id: ticketId },
        include: TICKET_INCLUDE,
      });

      await eventService.create({
        organizationId: ticket.organizationId,
        scopeType: "ticket",
        scopeId: ticketId,
        eventType: "ticket_linked",
        payload: { ticketId, entityType, entityId },
        actorType,
        actorId,
      }, tx);

      return ticket;
    });

    return ticket;
  }

  async unlink({ ticketId, entityType, entityId, actorType, actorId }: {
    ticketId: string;
    entityType: EntityType;
    entityId: string;
    actorType: ActorType;
    actorId: string;
  }) {
    const ticket = await prisma.$transaction(async (tx) => {
      await tx.ticketLink.delete({
        where: {
          ticketId_entityType_entityId: { ticketId, entityType, entityId },
        },
      });

      const ticket = await tx.ticket.findUniqueOrThrow({
        where: { id: ticketId },
        include: TICKET_INCLUDE,
      });

      await eventService.create({
        organizationId: ticket.organizationId,
        scopeType: "ticket",
        scopeId: ticketId,
        eventType: "ticket_unlinked",
        payload: { ticketId, entityType, entityId },
        actorType,
        actorId,
      }, tx);

      return ticket;
    });

    return ticket;
  }
}

export const ticketService = new TicketService();
