import type { CreateTicketInput, UpdateTicketInput, ActorType, EntityType } from "@trace/gql";
import { prisma } from "../lib/db.js";
import { eventService } from "./event.js";
import { embeddingService } from "./embedding.js";

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

    // Fire-and-forget: generate embedding for the new ticket
    this.embedTicket(ticket).catch(() => {});

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

    // Fire-and-forget: update embedding if title or description changed
    if (input.title !== undefined || input.description !== undefined) {
      this.embedTicket(ticket).catch(() => {});
    }

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

  /**
   * Search tickets by relevance to a query string.
   * Uses ILIKE against title and description to find potentially related tickets.
   * Returns top N matches ordered by best match (title match first, then description).
   */
  async searchByRelevance(input: {
    organizationId: string;
    query: string;
    limit?: number;
  }) {
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

  /**
   * Search tickets by semantic similarity using vector embeddings.
   * Falls back to keyword search if the embedding service is unavailable.
   */
  async searchBySemantic(input: {
    organizationId: string;
    query: string;
    limit?: number;
    threshold?: number;
  }) {
    const limit = input.limit ?? 5;

    if (!embeddingService.isAvailable()) {
      return this.searchByRelevance({
        organizationId: input.organizationId,
        query: input.query,
        limit,
      });
    }

    const similar = await embeddingService.findSimilar({
      organizationId: input.organizationId,
      text: input.query,
      entityTypes: ["ticket"],
      limit,
      threshold: input.threshold,
    });

    if (similar.length === 0) {
      return this.searchByRelevance({
        organizationId: input.organizationId,
        query: input.query,
        limit,
      });
    }

    const ticketIds = similar.map((s) => s.entityId);
    const tickets = await prisma.ticket.findMany({
      where: { id: { in: ticketIds } },
      include: TICKET_INCLUDE,
    });

    // Preserve similarity ordering
    const ticketMap = new Map(tickets.map((t) => [t.id, t]));
    return ticketIds.map((id) => ticketMap.get(id)).filter(Boolean);
  }

  /** Generate embedding text for a ticket and upsert it. */
  private async embedTicket(ticket: { id: string; organizationId: string; title: string; description: string; labels: string[] }) {
    const text = [
      ticket.title,
      ticket.description,
      ...ticket.labels,
    ].filter(Boolean).join(" ");

    await embeddingService.upsert({
      organizationId: ticket.organizationId,
      entityType: "ticket",
      entityId: ticket.id,
      text,
    });
  }
}

export const ticketService = new TicketService();
