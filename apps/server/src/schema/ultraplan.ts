import type { Context } from "../context.js";
import type {
  RequestUltraplanHumanGateInput,
  StartUltraplanInput,
  UltraplanHumanGateResolution,
} from "@trace/gql";
import { requireOrgContext } from "../lib/require-org.js";
import { ultraplanService } from "../services/ultraplan.js";
import { ultraplanControllerRunService } from "../services/ultraplan-controller-run.js";
import { prisma } from "../lib/db.js";

function optionalJsonObject(value: unknown, fieldName: string): Record<string, unknown> | null {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${fieldName} must be an object`);
  }
  return value as Record<string, unknown>;
}

export const ultraplanQueries = {
  ultraplan: (_: unknown, args: { id: string }, ctx: Context) => {
    return ultraplanService.get(args.id, requireOrgContext(ctx));
  },
  ultraplanForSessionGroup: (_: unknown, args: { sessionGroupId: string }, ctx: Context) => {
    return ultraplanService.getForSessionGroup(args.sessionGroupId, requireOrgContext(ctx));
  },
  ultraplanControllerRun: (_: unknown, args: { id: string }, ctx: Context) => {
    return ultraplanControllerRunService.get(args.id, requireOrgContext(ctx));
  },
};

export const ultraplanMutations = {
  startUltraplan: (_: unknown, args: { input: StartUltraplanInput }, ctx: Context) => {
    return ultraplanService.start({
      ...args.input,
      organizationId: requireOrgContext(ctx),
      actorType: ctx.actorType,
      actorId: ctx.userId,
    });
  },
  pauseUltraplan: (_: unknown, args: { id: string }, ctx: Context) => {
    return ultraplanService.pause(args.id, ctx.actorType, ctx.userId);
  },
  resumeUltraplan: (_: unknown, args: { id: string }, ctx: Context) => {
    return ultraplanService.resume(args.id, ctx.actorType, ctx.userId);
  },
  runUltraplanControllerNow: (_: unknown, args: { id: string }, ctx: Context) => {
    return ultraplanService.runControllerNow(args.id, ctx.actorType, ctx.userId);
  },
  cancelUltraplan: (_: unknown, args: { id: string }, ctx: Context) => {
    return ultraplanService.cancel(args.id, ctx.actorType, ctx.userId);
  },
  requestUltraplanHumanGate: (
    _: unknown,
    args: { input: RequestUltraplanHumanGateInput },
    ctx: Context,
  ) => {
    return ultraplanService.requestHumanGate({
      ...args.input,
      organizationId: requireOrgContext(ctx),
      actorType: ctx.actorType,
      actorId: ctx.userId,
      summary: args.input.summary ?? null,
      payload: optionalJsonObject(args.input.payload, "payload"),
      controllerRunId: args.input.controllerRunId ?? null,
      ticketId: args.input.ticketId ?? null,
      ticketExecutionId: args.input.ticketExecutionId ?? null,
    });
  },
  resolveUltraplanHumanGate: (
    _: unknown,
    args: {
      inboxItemId: string;
      resolution: UltraplanHumanGateResolution;
      response?: Record<string, unknown> | null;
    },
    ctx: Context,
  ) => {
    return ultraplanService.resolveHumanGate({
      inboxItemId: args.inboxItemId,
      organizationId: requireOrgContext(ctx),
      actorType: ctx.actorType,
      actorId: ctx.userId,
      resolution: args.resolution,
      response: optionalJsonObject(args.response, "response"),
    });
  },
};

export const ultraplanTypeResolvers = {
  Ultraplan: {
    sessionGroup: (ultraplan: { sessionGroupId: string }, _args: unknown, ctx: Context) =>
      ctx.sessionGroupLoader.load(ultraplan.sessionGroupId),
    ownerUser: (ultraplan: { ownerUserId: string }, _args: unknown, ctx: Context) =>
      ctx.userLoader.load(ultraplan.ownerUserId),
    activeInboxItem: (ultraplan: { activeInboxItemId?: string | null }, _args: unknown) =>
      ultraplan.activeInboxItemId
        ? prisma.inboxItem.findFirst({ where: { id: ultraplan.activeInboxItemId } })
        : null,
    lastControllerRun: (ultraplan: { lastControllerRunId?: string | null }, _args: unknown) =>
      ultraplan.lastControllerRunId
        ? prisma.ultraplanControllerRun.findUnique({ where: { id: ultraplan.lastControllerRunId } })
        : null,
    tickets: (ultraplan: { id: string }) =>
      prisma.ultraplanTicket.findMany({ where: { ultraplanId: ultraplan.id } }),
    ticketExecutions: (ultraplan: { id: string }) =>
      prisma.ticketExecution.findMany({ where: { ultraplanId: ultraplan.id } }),
    controllerRuns: (ultraplan: { id: string; organizationId: string }) =>
      ultraplanControllerRunService.listForUltraplan(ultraplan.id, ultraplan.organizationId),
  },
  UltraplanTicket: {
    ultraplan: (ticket: { ultraplanId: string }) =>
      prisma.ultraplan.findUnique({ where: { id: ticket.ultraplanId } }),
    ticket: (ticket: { ticketId: string }) =>
      prisma.ticket.findUnique({ where: { id: ticket.ticketId } }),
    generatedByRun: (ticket: { generatedByRunId?: string | null }) =>
      ticket.generatedByRunId
        ? prisma.ultraplanControllerRun.findUnique({ where: { id: ticket.generatedByRunId } })
        : null,
  },
  UltraplanControllerRun: {
    ultraplan: (run: { ultraplanId: string }) =>
      prisma.ultraplan.findUnique({ where: { id: run.ultraplanId } }),
    sessionGroup: (run: { sessionGroupId: string }, _args: unknown, ctx: Context) =>
      ctx.sessionGroupLoader.load(run.sessionGroupId),
    session: (run: { sessionId?: string | null }, _args: unknown, ctx: Context) =>
      run.sessionId ? ctx.sessionLoader.load(run.sessionId) : null,
    triggerEvent: (run: { triggerEventId?: string | null }, _args: unknown, ctx: Context) =>
      run.triggerEventId ? ctx.eventLoader.load(run.triggerEventId) : null,
    generatedTickets: (run: { id: string }) =>
      prisma.ultraplanTicket.findMany({ where: { generatedByRunId: run.id } }),
  },
  TicketExecution: {
    ultraplan: (execution: { ultraplanId: string }) =>
      prisma.ultraplan.findUnique({ where: { id: execution.ultraplanId } }),
    ticket: (execution: { ticketId: string }) =>
      prisma.ticket.findUnique({ where: { id: execution.ticketId } }),
    sessionGroup: (execution: { sessionGroupId: string }, _args: unknown, ctx: Context) =>
      ctx.sessionGroupLoader.load(execution.sessionGroupId),
    workerSession: (
      execution: { workerSessionId?: string | null },
      _args: unknown,
      ctx: Context,
    ) => (execution.workerSessionId ? ctx.sessionLoader.load(execution.workerSessionId) : null),
    activeInboxItem: (execution: { activeInboxItemId?: string | null }) =>
      execution.activeInboxItemId
        ? prisma.inboxItem.findFirst({ where: { id: execution.activeInboxItemId } })
        : null,
  },
};
