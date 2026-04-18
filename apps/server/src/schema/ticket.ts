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
import { assertTicketInOrg } from "../services/access.js";

export const ticketQueries = {
  tickets: (_: unknown, args: { organizationId: string; filters?: TicketFilters }, ctx: Context) => {
    const orgId = requireOrgContext(ctx);
    if (orgId !== args.organizationId) {
      throw new Error("Not authorized for this organization");
    }
    return ticketService.list(orgId, args.filters);
  },
  ticket: async (_: unknown, args: { id: string }, ctx: Context) => {
    const orgId = requireOrgContext(ctx);
    await assertTicketInOrg(args.id, orgId);
    return ticketService.get(args.id);
  },
};

export const ticketMutations = {
  createTicket: (_: unknown, args: { input: CreateTicketInput }, ctx: Context) => {
    const orgId = requireOrgContext(ctx);
    if (orgId !== args.input.organizationId) {
      throw new Error("Not authorized for this organization");
    }
    return ticketService.create({
      ...args.input,
      actorType: ctx.actorType,
      actorId: ctx.userId,
    });
  },
  updateTicket: async (_: unknown, args: { id: string; input: UpdateTicketInput }, ctx: Context) => {
    const orgId = requireOrgContext(ctx);
    await assertTicketInOrg(args.id, orgId);
    return ticketService.update(args.id, args.input, ctx.actorType, ctx.userId);
  },
  commentOnTicket: async (_: unknown, args: { ticketId: string; text: string }, ctx: Context) => {
    const orgId = requireOrgContext(ctx);
    await assertTicketInOrg(args.ticketId, orgId);
    return ticketService.addComment(args.ticketId, args.text, ctx.actorType, ctx.userId);
  },
  assignTicket: async (_: unknown, args: { ticketId: string; userId: string }, ctx: Context) => {
    const orgId = requireOrgContext(ctx);
    await assertTicketInOrg(args.ticketId, orgId);
    return ticketService.assign({
      ticketId: args.ticketId,
      userId: args.userId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
    });
  },
  unassignTicket: async (_: unknown, args: { ticketId: string; userId: string }, ctx: Context) => {
    const orgId = requireOrgContext(ctx);
    await assertTicketInOrg(args.ticketId, orgId);
    return ticketService.unassign({
      ticketId: args.ticketId,
      userId: args.userId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
    });
  },
  linkTicket: async (_: unknown, args: { ticketId: string; entityType: EntityType; entityId: string }, ctx: Context) => {
    const orgId = requireOrgContext(ctx);
    await assertTicketInOrg(args.ticketId, orgId);
    return ticketService.link({
      ticketId: args.ticketId,
      entityType: args.entityType,
      entityId: args.entityId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
    });
  },
  unlinkTicket: async (_: unknown, args: { ticketId: string; entityType: EntityType; entityId: string }, ctx: Context) => {
    const orgId = requireOrgContext(ctx);
    await assertTicketInOrg(args.ticketId, orgId);
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
    subscribe: async (
      _: unknown,
      args: { ticketId: string; organizationId: string },
      ctx: Context,
    ) => {
      const orgId = requireOrgContext(ctx);
      if (orgId !== args.organizationId) {
        throw new Error("Not authorized for this organization");
      }
      await assertTicketInOrg(args.ticketId, orgId);
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
        (session: LoadedSession): session is Exclude<LoadedSession, Error | null> => session != null,
      );
    },
  },
};
