import type { CreateTicketInput, UpdateTicketInput, ActorType, EntityType } from "@trace/gql";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { eventService } from "./event.js";
import { assertActorOrgAccess } from "./actor-auth.js";

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
  async list(
    organizationId: string,
    filters?: {
      status?: string | null;
      priority?: string | null;
      channelId?: string | null;
    },
  ) {
    const where: Record<string, unknown> = { organizationId };
    if (filters?.status) where.status = filters.status;
    if (filters?.priority) where.priority = filters.priority;
    if (filters?.channelId) where.channelId = filters.channelId;

    return prisma.ticket.findMany({ where, include: TICKET_INCLUDE });
  }

  async get(id: string, organizationId: string) {
    return prisma.ticket.findFirst({
      where: { id, organizationId },
      include: TICKET_INCLUDE,
    });
  }

  async listForSession(sessionId: string) {
    return prisma.ticket.findMany({
      where: { links: { some: { entityType: "session", entityId: sessionId } } },
      include: TICKET_INCLUDE,
    });
  }

  async create(input: CreateTicketServiceInput) {
    const [ticket] = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await assertActorOrgAccess(tx, input.organizationId, input.actorType, input.actorId);

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
              create: input.assigneeIds.map((userId: string) => ({ userId })),
            },
          }),
        },
        include: TICKET_INCLUDE,
      });

      const event = await eventService.create(
        {
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
        },
        tx,
      );

      return [ticket, event] as const;
    });

    return ticket;
  }

  async update(id: string, input: UpdateTicketInput, actorType: ActorType, actorId: string) {
    const existing = await prisma.ticket.findUniqueOrThrow({
      where: { id },
      select: { organizationId: true, status: true },
    });
    await prisma.$transaction((tx: Prisma.TransactionClient) =>
      assertActorOrgAccess(tx, existing.organizationId, actorType, actorId),
    );

    const ticket = await prisma.ticket.update({
      where: { id },
      data: {
        ...(input.title !== undefined && input.title !== null && { title: input.title }),
        ...(input.description !== undefined &&
          input.description !== null && { description: input.description }),
        ...(input.status !== undefined && input.status !== null && { status: input.status }),
        ...(input.priority !== undefined &&
          input.priority !== null && { priority: input.priority }),
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
    await prisma.$transaction((tx: Prisma.TransactionClient) =>
      assertActorOrgAccess(tx, ticket.organizationId, actorType, actorId),
    );

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

  async assign({
    ticketId,
    userId,
    actorType,
    actorId,
  }: {
    ticketId: string;
    userId: string;
    actorType: ActorType;
    actorId: string;
  }) {
    const ticket = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await tx.ticket.findUniqueOrThrow({
        where: { id: ticketId },
        select: { organizationId: true },
      });
      await assertActorOrgAccess(tx, existing.organizationId, actorType, actorId);
      await tx.ticketAssignee.create({
        data: { ticketId, userId },
      });

      const ticket = await tx.ticket.findUniqueOrThrow({
        where: { id: ticketId },
        include: TICKET_INCLUDE,
      });

      await eventService.create(
        {
          organizationId: ticket.organizationId,
          scopeType: "ticket",
          scopeId: ticketId,
          eventType: "ticket_assigned",
          payload: { ticketId, userId },
          actorType,
          actorId,
        },
        tx,
      );

      return ticket;
    });

    return ticket;
  }

  async unassign({
    ticketId,
    userId,
    actorType,
    actorId,
  }: {
    ticketId: string;
    userId: string;
    actorType: ActorType;
    actorId: string;
  }) {
    const ticket = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await tx.ticket.findUniqueOrThrow({
        where: { id: ticketId },
        select: { organizationId: true },
      });
      await assertActorOrgAccess(tx, existing.organizationId, actorType, actorId);
      await tx.ticketAssignee.delete({
        where: { ticketId_userId: { ticketId, userId } },
      });

      const ticket = await tx.ticket.findUniqueOrThrow({
        where: { id: ticketId },
        include: TICKET_INCLUDE,
      });

      await eventService.create(
        {
          organizationId: ticket.organizationId,
          scopeType: "ticket",
          scopeId: ticketId,
          eventType: "ticket_unassigned",
          payload: { ticketId, userId },
          actorType,
          actorId,
        },
        tx,
      );

      return ticket;
    });

    return ticket;
  }

  async link({
    ticketId,
    entityType,
    entityId,
    actorType,
    actorId,
  }: {
    ticketId: string;
    entityType: EntityType;
    entityId: string;
    actorType: ActorType;
    actorId: string;
  }) {
    const ticket = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await tx.ticket.findUniqueOrThrow({
        where: { id: ticketId },
        select: { organizationId: true },
      });
      await assertActorOrgAccess(tx, existing.organizationId, actorType, actorId);
      await tx.ticketLink.create({
        data: { ticketId, entityType, entityId },
      });

      const ticket = await tx.ticket.findUniqueOrThrow({
        where: { id: ticketId },
        include: TICKET_INCLUDE,
      });

      await eventService.create(
        {
          organizationId: ticket.organizationId,
          scopeType: "ticket",
          scopeId: ticketId,
          eventType: "ticket_linked",
          payload: { ticketId, entityType, entityId },
          actorType,
          actorId,
        },
        tx,
      );

      return ticket;
    });

    return ticket;
  }

  async unlink({
    ticketId,
    entityType,
    entityId,
    actorType,
    actorId,
  }: {
    ticketId: string;
    entityType: EntityType;
    entityId: string;
    actorType: ActorType;
    actorId: string;
  }) {
    const ticket = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await tx.ticket.findUniqueOrThrow({
        where: { id: ticketId },
        select: { organizationId: true },
      });
      await assertActorOrgAccess(tx, existing.organizationId, actorType, actorId);
      await tx.ticketLink.delete({
        where: {
          ticketId_entityType_entityId: { ticketId, entityType, entityId },
        },
      });

      const ticket = await tx.ticket.findUniqueOrThrow({
        where: { id: ticketId },
        include: TICKET_INCLUDE,
      });

      await eventService.create(
        {
          organizationId: ticket.organizationId,
          scopeType: "ticket",
          scopeId: ticketId,
          eventType: "ticket_unlinked",
          payload: { ticketId, entityType, entityId },
          actorType,
          actorId,
        },
        tx,
      );

      return ticket;
    });

    return ticket;
  }

  /**
   * Get a ticket by its exact ID. Returns null if not found or not in the org.
   * Used by the agent to look up specific ticket status/details.
   */
  async getById(organizationId: string, ticketId: string) {
    return prisma.ticket.findFirst({
      where: { id: ticketId, organizationId },
      include: TICKET_INCLUDE,
    });
  }

  /**
   * Search tickets by relevance to a query string.
   * Uses ILIKE against title and description to find potentially related tickets.
   * Returns top N matches ordered by best match (title match first, then description).
   */
  async searchByRelevance(input: { organizationId: string; query: string; limit?: number }) {
    const limit = input.limit ?? 5;
    const query = input.query.trim();
    if (!query) return [];

    // Extract meaningful keywords (3+ chars) for searching
    const keywords = query
      .split(/\s+/)
      .filter((w) => w.length >= 3)
      .slice(0, 10); // cap to avoid overly complex queries

    if (keywords.length === 0) return [];

    // Build ILIKE conditions for each keyword against title and description
    const orConditions = keywords.flatMap((kw) => [
      { title: { contains: kw, mode: "insensitive" as const } },
      { description: { contains: kw, mode: "insensitive" as const } },
    ]);

    return prisma.ticket.findMany({
      where: {
        organizationId: input.organizationId,
        OR: orConditions,
      },
      include: TICKET_INCLUDE,
      take: limit,
      orderBy: { updatedAt: "desc" },
    });
  }
}

export const ticketService = new TicketService();
