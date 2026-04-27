import type { Context } from "../context.js";
import {
  executionLoggingService,
  type QueryExecutionLogsInput,
} from "../services/execution-logging.js";
import { costTrackingService } from "../services/cost-tracking.js";
import { orgMemberService } from "../services/org-member.js";
import { llmCallLoggingService } from "../services/llm-call-logging.js";
import { getWorkerStatus, getAggregationWindows } from "../services/agent-worker-status.js";

export const agentDebugTypeResolvers = {
  AgentExecutionLog: {
    llmCalls: (parent: { id: string; organizationId: string }) =>
      llmCallLoggingService.getByExecutionLogId(parent.organizationId, parent.id),
  },
};

export const agentDebugQueries = {
  agentExecutionLogs: async (
    _: unknown,
    args: {
      organizationId: string;
      filters?: {
        status?: string;
        disposition?: string;
        startDate?: string;
        endDate?: string;
        limit?: number;
        offset?: number;
      };
    },
    ctx: Context,
  ) => {
    await orgMemberService.assertMembership(ctx.userId, args.organizationId);

    const queryInput = {
      organizationId: args.organizationId,
      status: args.filters?.status as QueryExecutionLogsInput["status"],
      startDate: args.filters?.startDate ? new Date(args.filters.startDate) : undefined,
      endDate: args.filters?.endDate ? new Date(args.filters.endDate) : undefined,
      limit: args.filters?.limit ?? 50,
      offset: args.filters?.offset ?? 0,
    };

    const [items, totalCount] = await Promise.all([
      executionLoggingService.query(queryInput),
      executionLoggingService.count({
        organizationId: queryInput.organizationId,
        status: queryInput.status,
        startDate: queryInput.startDate,
        endDate: queryInput.endDate,
      }),
    ]);

    return { items, totalCount };
  },

  agentExecutionLog: async (
    _: unknown,
    args: { organizationId: string; id: string },
    ctx: Context,
  ) => {
    await orgMemberService.assertMembership(ctx.userId, args.organizationId);
    return executionLoggingService.getById({
      organizationId: args.organizationId,
      id: args.id,
    });
  },

  agentCostSummary: async (
    _: unknown,
    args: { organizationId: string; startDate: string; endDate: string },
    ctx: Context,
  ) => {
    await orgMemberService.assertMembership(ctx.userId, args.organizationId);

    const [budget, dailyCosts] = await Promise.all([
      costTrackingService.checkBudget(args.organizationId),
      costTrackingService.getByDateRange({
        organizationId: args.organizationId,
        startDate: args.startDate,
        endDate: args.endDate,
      }),
    ]);

    return { budget, dailyCosts: dailyCosts };
  },

  agentWorkerStatus: async (_: unknown, args: { organizationId: string }, ctx: Context) => {
    await orgMemberService.assertMembership(ctx.userId, args.organizationId);

    const status = await getWorkerStatus();
    return {
      running: status.running,
      uptime: status.startedAt > 0 ? Math.floor((Date.now() - status.startedAt) / 1000) : null,
      openAggregationWindows: status.openAggregationWindows,
      activeOrganizations: status.activeOrganizations,
    };
  },

  agentAggregationWindows: async (_: unknown, args: { organizationId: string }, ctx: Context) => {
    await orgMemberService.assertMembership(ctx.userId, args.organizationId);

    const windows = await getAggregationWindows(args.organizationId);
    return windows.map((w) => ({
      scopeKey: w.scopeKey,
      organizationId: w.organizationId,
      eventCount: w.eventCount,
      openedAt: new Date(w.openedAt).toISOString(),
      lastEventAt: new Date(w.lastEventAt).toISOString(),
    }));
  },
};
