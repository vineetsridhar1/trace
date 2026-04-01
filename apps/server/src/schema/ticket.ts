import type { Context } from "../context.js";
import type {
  CreateTicketInput,
  EntityType,
  TicketFilters,
  UpdateTicketInput,
} from "@trace/gql";
import { ticketService } from "../services/ticket.js";
import { pubsub, topics } from "../lib/pubsub.js";
import { requireOrgContext } from "../lib/require-org.js";

export const ticketQueries = {
  tickets: (_: unknown, args: { organizationId: string; filters?: TicketFilters }, ctx: Context) => {
    requireOrgContext(ctx);
    return ticketService.list(args.organizationId, args.filters);
  },
  ticket: (_: unknown, args: { id: string }, ctx: Context) => {
    requireOrgContext(ctx);
    return ticketService.get(args.id);
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

type LoadedSession = Awaited<ReturnType<Context["sessionLoader"]["load"]>>;

export const ticketTypeResolvers = {
  Ticket: {
    createdBy: (ticket: { createdById: string }, _args: unknown, ctx: Context) =>
      ctx.userLoader.load(ticket.createdById),
    assignees: (ticket: { assignees?: TicketAssigneeWithUser[] }) =>
      (ticket.assignees ?? []).map((a) => a.user),
    sessions: async (ticket: { links?: TicketLinkRow[] }, _args: unknown, ctx: Context) => {
      const sessionLinks = (ticket.links ?? []).filter((l) => l.entityType === "session");
      if (sessionLinks.length === 0) return [];
      const sessions = await Promise.all(
        sessionLinks.map(async (link) => {
          const session = await ctx.sessionLoader.load(link.entityId);
          return session instanceof Error ? null : session;
        }),
      );
      return sessions.filter(
        (session): session is Exclude<LoadedSession, Error | null> => session != null,
      );
    },
  },
};
