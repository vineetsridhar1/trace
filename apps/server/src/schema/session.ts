import type { Prisma } from "@prisma/client";
import type { Context } from "../context.js";
import type {
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
    return prisma.session.findMany({ where, include: { createdBy: true, repo: true, channel: true } });
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
    return prisma.session.findMany({ where, include: { createdBy: true, repo: true, channel: true } });
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
  pauseSession: (_: unknown, args: { id: string }, _ctx: Context) => {
    return sessionService.pause(args.id);
  },
  resumeSession: (_: unknown, args: { id: string }, _ctx: Context) => {
    return sessionService.resume(args.id);
  },
  terminateSession: (_: unknown, args: { id: string }, _ctx: Context) => {
    return sessionService.terminate(args.id);
  },
  sendSessionMessage: (_: unknown, args: { sessionId: string; text: string }, ctx: Context) => {
    return sessionService.sendMessage(args.sessionId, args.text, ctx.actorType, ctx.userId);
  },
  linkSessionToTicket: (_: unknown, args: { sessionId: string; ticketId: string }, _ctx: Context) => {
    return prisma.session.update({
      where: { id: args.sessionId },
      data: { tickets: { create: { ticketId: args.ticketId } } },
      include: { createdBy: true, repo: true, channel: true },
    });
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
