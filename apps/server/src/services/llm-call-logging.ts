import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/db.js";

export interface LlmCallRecord {
  turnNumber: number;
  model: string;
  provider: string;
  systemPrompt: string | null;
  messages: unknown[];
  tools: unknown[];
  maxTokens?: number;
  temperature?: number;
  responseContent: unknown[];
  stopReason: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostCents: number;
  latencyMs: number;
}

export class LlmCallLoggingService {
  async writeMany(executionLogId: string, calls: LlmCallRecord[]) {
    if (calls.length === 0) return;

    await prisma.agentLlmCall.createMany({
      data: calls.map((call) => ({
        executionLogId,
        turnNumber: call.turnNumber,
        model: call.model,
        provider: call.provider,
        systemPrompt: call.systemPrompt,
        messages: call.messages as Prisma.InputJsonValue,
        tools: call.tools as Prisma.InputJsonValue,
        maxTokens: call.maxTokens ?? null,
        temperature: call.temperature ?? null,
        responseContent: call.responseContent as Prisma.InputJsonValue,
        stopReason: call.stopReason,
        inputTokens: call.inputTokens,
        outputTokens: call.outputTokens,
        estimatedCostCents: call.estimatedCostCents,
        latencyMs: call.latencyMs,
      })),
    });
  }

  async getByExecutionLogId(organizationId: string, executionLogId: string) {
    return prisma.agentLlmCall.findMany({
      where: {
        executionLogId,
        executionLog: { organizationId },
      },
      orderBy: { turnNumber: "asc" },
    });
  }
}

export const llmCallLoggingService = new LlmCallLoggingService();
