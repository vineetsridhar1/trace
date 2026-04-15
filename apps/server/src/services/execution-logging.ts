import type {
  ExecutionDisposition,
  ExecutionStatus,
  ModelTier,
  Prisma,
} from "@prisma/client";
import { prisma } from "../lib/db.js";

export interface WriteExecutionLogInput {
  organizationId: string;
  triggerEventId: string;
  batchSize?: number;
  agentId: string;
  modelTier: ModelTier;
  model: string;
  promoted?: boolean;
  promotionReason?: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostCents: number;
  contextTokenAllocation?: Record<string, number>;
  disposition: ExecutionDisposition;
  confidence: number;
  plannedActions?: Record<string, unknown>[];
  policyDecision?: Record<string, unknown>;
  finalActions?: Record<string, unknown>[];
  status: ExecutionStatus;
  inboxItemId?: string;
  latencyMs: number;
}

export interface QueryExecutionLogsInput {
  organizationId: string;
  startDate?: Date;
  endDate?: Date;
  status?: ExecutionStatus;
  agentId?: string;
  limit?: number;
  offset?: number;
}

export class ExecutionLoggingService {
  async write(input: WriteExecutionLogInput): Promise<{ id: string }> {
    return prisma.agentExecutionLog.create({
      data: {
        organizationId: input.organizationId,
        triggerEventId: input.triggerEventId,
        batchSize: input.batchSize ?? 1,
        agentId: input.agentId,
        modelTier: input.modelTier,
        model: input.model,
        promoted: input.promoted ?? false,
        promotionReason: input.promotionReason,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        estimatedCostCents: input.estimatedCostCents,
        contextTokenAllocation: (input.contextTokenAllocation ??
          {}) as Prisma.InputJsonValue,
        disposition: input.disposition,
        confidence: input.confidence,
        plannedActions: (input.plannedActions ?? []) as Prisma.InputJsonValue,
        policyDecision: (input.policyDecision ?? {}) as Prisma.InputJsonValue,
        finalActions: (input.finalActions ?? []) as Prisma.InputJsonValue,
        status: input.status,
        inboxItemId: input.inboxItemId,
        latencyMs: input.latencyMs,
      },
    });
  }

  async query(input: QueryExecutionLogsInput) {
    const where: Prisma.AgentExecutionLogWhereInput = {
      organizationId: input.organizationId,
    };

    if (input.startDate || input.endDate) {
      const createdAt: { gte?: Date; lte?: Date } = {};
      if (input.startDate) createdAt.gte = input.startDate;
      if (input.endDate) createdAt.lte = input.endDate;
      where.createdAt = createdAt;
    }

    if (input.status) where.status = input.status;
    if (input.agentId) where.agentId = input.agentId;

    return prisma.agentExecutionLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: input.limit ?? 50,
      skip: input.offset ?? 0,
    });
  }

  async getById(input: { organizationId: string; id: string }) {
    return prisma.agentExecutionLog.findFirst({
      where: {
        id: input.id,
        organizationId: input.organizationId,
      },
    });
  }

  async count(input: Omit<QueryExecutionLogsInput, "limit" | "offset">) {
    const where: Prisma.AgentExecutionLogWhereInput = {
      organizationId: input.organizationId,
    };

    if (input.startDate || input.endDate) {
      const createdAt: { gte?: Date; lte?: Date } = {};
      if (input.startDate) createdAt.gte = input.startDate;
      if (input.endDate) createdAt.lte = input.endDate;
      where.createdAt = createdAt;
    }

    if (input.status) where.status = input.status;
    if (input.agentId) where.agentId = input.agentId;

    return prisma.agentExecutionLog.count({ where });
  }

  async getByTriggerEvent(input: {
    organizationId: string;
    triggerEventId: string;
  }) {
    return prisma.agentExecutionLog.findMany({
      where: {
        organizationId: input.organizationId,
        triggerEventId: input.triggerEventId,
      },
      orderBy: { createdAt: "desc" },
    });
  }
}

export const executionLoggingService = new ExecutionLoggingService();
