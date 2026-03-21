import type { Prisma } from "@prisma/client";
import type { Context } from "../context.js";
import type {
  CreateTicketInput,
  EntityType,
  TicketFilters,
  UpdateTicketInput,
} from "@trace/gql";
import { prisma } from "../lib/db.js";
import { ticketService } from "../services/ticket.js";
import { pubsub, topics } from "../lib/pubsub.js";
import { resolveActor } from "../services/actor.js";

export const ticketQueries = {
  tickets: (_: unknown, args: { organizationId: string; filters?: TicketFilters }, _ctx: Context) => {
    const where: Prisma.TicketWhereInput = { organizationId: args.organizationId };
    if (args.filters?.status) where.status = args.filters.status;
    if (args.filters?.priority) where.priority = args.filters.priority;
    if (args.filters?.channelId) where.channelId = args.filters.channelId;
    return prisma.ticket.findMany({ where });
  },
  ticket: (_: unknown, args: { id: string }, _ctx: Context) => {
    return prisma.ticket.findUnique({ where: { id: args.id } });
  },
};

export const ticketMutations = {
  createTicket: (_: unknown, args: { input: CreateTicketInput }, ctx: Context) => {
    return ticketService.create({
      ...args.input,
      actorType: ctx.actorType,
      actorId: ctx.userId,
    });
  },
  updateTicket: (_: unknown, args: { id: string; input: UpdateTicketInput }, ctx: Context) => {
    return ticketService.update(args.id, args.input, ctx.actorType, ctx.userId);
  },
  commentOnTicket: (_: unknown, args: { ticketId: string; text: string }, ctx: Context) => {
    return ticketService.addComment(args.ticketId, args.text, ctx.actorType, ctx.userId);
  },
  assignTicket: (_: unknown, args: { ticketId: string; userId: string }, ctx: Context) => {
    return ticketService.assign({
      ticketId: args.ticketId,
      userId: args.userId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
    });
  },
  unassignTicket: (_: unknown, args: { ticketId: string; userId: string }, ctx: Context) => {
    return ticketService.unassign({
      ticketId: args.ticketId,
      userId: args.userId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
    });
  },
  linkTicket: (_: unknown, args: { ticketId: string; entityType: EntityType; entityId: string }, ctx: Context) => {
    return ticketService.link({
      ticketId: args.ticketId,
      entityType: args.entityType,
      entityId: args.entityId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
    });
  },
  unlinkTicket: (_: unknown, args: { ticketId: string; entityType: EntityType; entityId: string }, ctx: Context) => {
    return ticketService.unlink({
      ticketId: args.ticketId,
      entityType: args.entityType,
      entityId: args.entityId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
    });
  },
};

export const ticketSubscriptions = {
  ticketEvents: {
    subscribe: (_: unknown, args: { ticketId: string; organizationId: string }) => {
      return pubsub.asyncIterator(topics.ticketEvents(args.ticketId));
    },
  },
};

type TicketAssigneeWithUser = {
  user: { id: string; email: string; name: string; avatarUrl: string | null; role: string };
};

type TicketLinkRow = {
  entityType: string;
  entityId: string;
};

export const ticketTypeResolvers = {
  Ticket: {
    createdBy: (ticket: { createdById: string }, _args: unknown, ctx: Context) =>
      ctx.userLoader.load(ticket.createdById),
    assignees: (ticket: { assignees?: TicketAssigneeWithUser[] }) =>
      (ticket.assignees ?? []).map((a) => a.user),
    sessions: async (ticket: { links?: TicketLinkRow[] }) => {
      const sessionLinks = (ticket.links ?? []).filter((l) => l.entityType === "session");
      if (sessionLinks.length === 0) return [];
      return prisma.session.findMany({
        where: { id: { in: sessionLinks.map((l) => l.entityId) } },
      });
    },
  },
};
