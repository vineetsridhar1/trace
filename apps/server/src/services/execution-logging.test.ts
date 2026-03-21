import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

import { prisma } from "../lib/db.js";
import { ExecutionLoggingService } from "./execution-logging.js";

const prismaMock = prisma as any;

describe("ExecutionLoggingService", () => {
  let service: ExecutionLoggingService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ExecutionLoggingService();
  });

  it("writes an execution log entry", async () => {
    const logEntry = {
      id: "log-1",
      organizationId: "org-1",
      triggerEventId: "evt-1",
      batchSize: 3,
      agentId: "agent-1",
      modelTier: "tier2" as const,
      model: "claude-haiku",
      promoted: false,
      promotionReason: null,
      inputTokens: 1000,
      outputTokens: 200,
      estimatedCostCents: 0.5,
      disposition: "suggest" as const,
      confidence: 0.8,
      plannedActions: [],
      policyDecision: { disposition: "suggest" },
      finalActions: [],
      status: "suggested" as const,
      inboxItemId: "inbox-1",
      latencyMs: 450,
      createdAt: new Date(),
    };

    prismaMock.agentExecutionLog.create.mockResolvedValueOnce(logEntry);

    const result = await service.write({
      organizationId: "org-1",
      triggerEventId: "evt-1",
      batchSize: 3,
      agentId: "agent-1",
      modelTier: "tier2",
      model: "claude-haiku",
      inputTokens: 1000,
      outputTokens: 200,
      estimatedCostCents: 0.5,
      disposition: "suggest",
      confidence: 0.8,
      plannedActions: [],
      policyDecision: { disposition: "suggest" },
      finalActions: [],
      status: "suggested",
      inboxItemId: "inbox-1",
      latencyMs: 450,
    });

    expect(result).toEqual(logEntry);
    expect(prismaMock.agentExecutionLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: "org-1",
        triggerEventId: "evt-1",
        batchSize: 3,
        agentId: "agent-1",
        modelTier: "tier2",
        status: "suggested",
      }),
    });
  });

  it("queries logs by org and date range", async () => {
    prismaMock.agentExecutionLog.findMany.mockResolvedValueOnce([]);

    const start = new Date("2026-03-01");
    const end = new Date("2026-03-21");

    await service.query({
      organizationId: "org-1",
      startDate: start,
      endDate: end,
    });

    expect(prismaMock.agentExecutionLog.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: "org-1",
        createdAt: { gte: start, lte: end },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      skip: 0,
    });
  });

  it("queries logs by status", async () => {
    prismaMock.agentExecutionLog.findMany.mockResolvedValueOnce([]);

    await service.query({
      organizationId: "org-1",
      status: "failed",
    });

    expect(prismaMock.agentExecutionLog.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: "org-1",
        status: "failed",
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      skip: 0,
    });
  });

  it("gets logs by trigger event with org scoping", async () => {
    prismaMock.agentExecutionLog.findMany.mockResolvedValueOnce([]);

    await service.getByTriggerEvent({
      organizationId: "org-1",
      triggerEventId: "evt-1",
    });

    expect(prismaMock.agentExecutionLog.findMany).toHaveBeenCalledWith({
      where: { organizationId: "org-1", triggerEventId: "evt-1" },
      orderBy: { createdAt: "desc" },
    });
  });
});
