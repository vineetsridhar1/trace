import type { Prisma } from "@prisma/client";
import type { Context } from "../context.js";
import type {
  CreateTicketInput,
  TicketFilters,
  UpdateTicketInput,
} from "@trace/gql";
import { prisma } from "../lib/db.js";
import { ticketService } from "../services/ticket.js";
import { pubsub, topics } from "../lib/pubsub.js";

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
  updateTicket: (_: unknown, args: { id: string; input: UpdateTicketInput }, _ctx: Context) => {
    return ticketService.update(args.id, args.input);
  },
  commentOnTicket: (_: unknown, args: { ticketId: string; text: string }, ctx: Context) => {
    return ticketService.addComment(args.ticketId, args.text, ctx.actorType, ctx.userId);
  },
};

export const ticketSubscriptions = {
  ticketEvents: {
    subscribe: (_: unknown, args: { ticketId: string; organizationId: string }) => {
      return pubsub.asyncIterator(topics.ticketEvents(args.ticketId));
    },
  },
};
