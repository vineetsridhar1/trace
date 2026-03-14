import type { Prisma } from "@prisma/client";
import type { Context } from "../context.js";
import type {
  CodingTool,
  SessionFilters,
  SessionStatus,
  StartSessionInput,
} from "@trace/gql";
import { prisma } from "../lib/db.js";
import { sessionService } from "../services/session.js";
import { pubsub, topics } from "../lib/pubsub.js";

export const sessionQueries = {
  sessions: (_: unknown, args: { organizationId: string; filters?: SessionFilters }, _ctx: Context) => {
    const where: Prisma.SessionWhereInput = { organizationId: args.organizationId };
    if (args.filters?.status) where.status = args.filters.status;
    if (args.filters?.tool) where.tool = args.filters.tool;
    if (args.filters?.repoId) where.repoId = args.filters.repoId;
    if (args.filters?.channelId) where.channelId = args.filters.channelId;
    return prisma.session.findMany({ where, orderBy: { updatedAt: "desc" }, include: { createdBy: true, repo: true, channel: true } });
  },
  session: (_: unknown, args: { id: string }, _ctx: Context) => {
    return prisma.session.findUnique({
      where: { id: args.id },
      include: { createdBy: true, repo: true, channel: true },
    });
  },
  mySessions: (_: unknown, args: { organizationId: string; status?: SessionStatus }, ctx: Context) => {
    const where: Prisma.SessionWhereInput = { organizationId: args.organizationId, createdById: ctx.userId };
    if (args.status) where.status = args.status;
    return prisma.session.findMany({ where, orderBy: { updatedAt: "desc" }, include: { createdBy: true, repo: true, channel: true } });
  },
};

export const sessionMutations = {
  startSession: (_: unknown, args: { input: StartSessionInput }, ctx: Context) => {
    return sessionService.start({
      ...args.input,
      organizationId: ctx.organizationId,
      createdById: ctx.userId,
    });
  },
  pauseSession: (_: unknown, args: { id: string }, ctx: Context) => {
    return sessionService.pause(args.id, ctx.actorType, ctx.userId);
  },
  resumeSession: (_: unknown, args: { id: string }, ctx: Context) => {
    return sessionService.resume(args.id, ctx.actorType, ctx.userId);
  },
  runSession: (_: unknown, args: { id: string; prompt?: string | null }, _ctx: Context) => {
    return sessionService.run(args.id, args.prompt);
  },
  terminateSession: (_: unknown, args: { id: string }, ctx: Context) => {
    return sessionService.terminate(args.id, ctx.actorType, ctx.userId);
  },
  updateSessionTool: (_: unknown, args: { sessionId: string; tool: CodingTool }, ctx: Context) => {
    return sessionService.updateTool(args.sessionId, args.tool, ctx.actorType, ctx.userId);
  },
  sendSessionMessage: (_: unknown, args: { sessionId: string; text: string }, ctx: Context) => {
    return sessionService.sendMessage(args.sessionId, args.text, ctx.actorType, ctx.userId);
  },
  linkSessionToTicket: (_: unknown, args: { sessionId: string; ticketId: string }, ctx: Context) => {
    return sessionService.linkToTicket(args.sessionId, args.ticketId, ctx.actorType, ctx.userId);
  },
};

export const sessionSubscriptions = {
  sessionEvents: {
    subscribe: (_: unknown, args: { sessionId: string; organizationId: string }) => {
      return pubsub.asyncIterator(topics.sessionEvents(args.sessionId));
    },
  },
  sessionPortsChanged: {
    subscribe: (_: unknown, args: { sessionId: string; organizationId: string }) => {
      return pubsub.asyncIterator(topics.sessionPorts(args.sessionId));
    },
  },
  sessionStatusChanged: {
    subscribe: (_: unknown, args: { sessionId: string; organizationId: string }) => {
      return pubsub.asyncIterator(topics.sessionStatus(args.sessionId));
    },
  },
};
