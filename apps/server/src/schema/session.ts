import type { Context } from "../context.js";
import type { CodingTool, SessionFilters, SessionStatus, StartSessionInput } from "@trace/gql";
import type { CodingTool as CodingToolEnum } from "@prisma/client";
import { sessionService } from "../services/session.js";
import { prisma } from "../lib/db.js";
import { pubsub, topics } from "../lib/pubsub.js";

export const sessionQueries = {
  sessions: (_: unknown, args: { organizationId: string; filters?: SessionFilters }) => {
    return sessionService.list(args.organizationId, args.filters ?? undefined);
  },
  session: (_: unknown, args: { id: string }) => {
    return sessionService.get(args.id);
  },
  mySessions: (
    _: unknown,
    args: { organizationId: string; status?: SessionStatus },
    ctx: Context,
  ) => {
    return sessionService.listByUser(args.organizationId, ctx.userId, args.status ?? undefined);
  },
  availableSessionRuntimes: (_: unknown, args: { sessionId: string }, ctx: Context) => {
    return sessionService.listAvailableRuntimes(args.sessionId, ctx.organizationId);
  },
  availableRuntimes: (_: unknown, args: { tool: CodingToolEnum }, ctx: Context) => {
    return sessionService.listRuntimesForTool(args.tool, ctx.organizationId);
  },
  repoBranches: (
    _: unknown,
    args: { repoId: string; runtimeInstanceId?: string | null },
    ctx: Context,
  ) => {
    return sessionService.listBranches(
      args.repoId,
      ctx.organizationId,
      args.runtimeInstanceId ?? undefined,
    );
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
  runSession: (
    _: unknown,
    args: { id: string; prompt?: string | null; interactionMode?: string | null },
    _ctx: Context,
  ) => {
    return sessionService.run(args.id, args.prompt, args.interactionMode ?? undefined);
  },
  terminateSession: (_: unknown, args: { id: string }, ctx: Context) => {
    return sessionService.terminate(args.id, ctx.actorType, ctx.userId);
  },
  dismissSession: (_: unknown, args: { id: string }, ctx: Context) => {
    return sessionService.dismiss(args.id, ctx.actorType, ctx.userId);
  },
  deleteSession: (_: unknown, args: { id: string }, ctx: Context) => {
    return sessionService.delete(args.id, ctx.actorType, ctx.userId);
  },
  updateSessionConfig: (
    _: unknown,
    args: { sessionId: string; tool?: CodingTool | null; model?: string | null },
    ctx: Context,
  ) => {
    return sessionService.updateConfig(
      args.sessionId,
      ctx.organizationId,
      { tool: args.tool ?? undefined, model: args.model ?? undefined },
      ctx.actorType,
      ctx.userId,
    );
  },
  sendSessionMessage: (
    _: unknown,
    args: { sessionId: string; text: string; interactionMode?: string | null },
    ctx: Context,
  ) => {
    return sessionService.sendMessage(
      args.sessionId,
      args.text,
      ctx.actorType,
      ctx.userId,
      args.interactionMode ?? undefined,
    );
  },
  retrySessionConnection: (_: unknown, args: { sessionId: string }, ctx: Context) => {
    return sessionService.retryConnection(
      args.sessionId,
      ctx.organizationId,
      ctx.actorType,
      ctx.userId,
    );
  },
  moveSessionToRuntime: (
    _: unknown,
    args: { sessionId: string; runtimeInstanceId: string },
    ctx: Context,
  ) => {
    return sessionService.moveToRuntime(
      args.sessionId,
      args.runtimeInstanceId,
      ctx.organizationId,
      ctx.actorType,
      ctx.userId,
    );
  },
  moveSessionToCloud: (
    _: unknown,
    args: { sessionId: string },
    ctx: Context,
  ) => {
    return sessionService.moveToCloud(
      args.sessionId,
      ctx.organizationId,
      ctx.actorType,
      ctx.userId,
    );
  },
};

export const sessionTypeResolvers = {
  Session: {
    tickets: async (session: { id: string }) => {
      const links = await prisma.ticketLink.findMany({
        where: { entityType: "session", entityId: session.id },
        select: { ticketId: true },
      });
      if (links.length === 0) return [];
      return prisma.ticket.findMany({
        where: { id: { in: links.map((l: { ticketId: string }) => l.ticketId) } },
      });
    },
  },
};

export const sessionSubscriptions = {
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
