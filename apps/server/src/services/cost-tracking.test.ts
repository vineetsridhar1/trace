import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

import { Prisma } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { CostTrackingService } from "./cost-tracking.js";

const prismaMock = prisma as any;

describe("CostTrackingService", () => {
  let service: CostTrackingService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CostTrackingService();
  });

  it("records tier2 cost with upsert", async () => {
    prismaMock.agentCostTracker.upsert.mockResolvedValueOnce({
      organizationId: "org-1",
      totalCostCents: 0.5,
      tier2Calls: 1,
      tier2CostCents: 0.5,
      tier3Calls: 0,
      tier3CostCents: 0,
      summaryCalls: 0,
      summaryCostCents: 0,
    });

    const result = await service.recordCost({
      organizationId: "org-1",
      modelTier: "tier2",
      costCents: 0.5,
    });

    expect(result.tier2Calls).toBe(1);
    expect(prismaMock.agentCostTracker.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          organizationId: "org-1",
          totalCostCents: 0.5,
          tier2Calls: 1,
          tier2CostCents: 0.5,
          tier3Calls: 0,
          tier3CostCents: 0,
          summaryCalls: 0,
          summaryCostCents: 0,
        }),
        update: expect.objectContaining({
          totalCostCents: { increment: 0.5 },
          tier2Calls: { increment: 1 },
          tier2CostCents: { increment: 0.5 },
          tier3Calls: { increment: 0 },
          tier3CostCents: { increment: 0 },
          summaryCalls: { increment: 0 },
          summaryCostCents: { increment: 0 },
        }),
      }),
    );
  });

  it("records tier3 cost correctly", async () => {
    prismaMock.agentCostTracker.upsert.mockResolvedValueOnce({
      organizationId: "org-1",
      totalCostCents: 5.0,
      tier2Calls: 0,
      tier2CostCents: 0,
      tier3Calls: 1,
      tier3CostCents: 5.0,
      summaryCalls: 0,
      summaryCostCents: 0,
    });

    await service.recordCost({
      organizationId: "org-1",
      modelTier: "tier3",
      costCents: 5.0,
    });

    expect(prismaMock.agentCostTracker.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          tier3Calls: 1,
          tier3CostCents: 5.0,
          summaryCalls: 0,
          summaryCostCents: 0,
        }),
      }),
    );
  });

  it("records summary cost separately from tier costs", async () => {
    prismaMock.agentCostTracker.upsert.mockResolvedValueOnce({
      organizationId: "org-1",
      totalCostCents: 1.0,
      tier2Calls: 1,
      tier2CostCents: 1.0,
      summaryCalls: 1,
      summaryCostCents: 1.0,
    });

    await service.recordCost({
      organizationId: "org-1",
      modelTier: "tier2",
      costCents: 1.0,
      isSummary: true,
    });

    expect(prismaMock.agentCostTracker.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          summaryCalls: 1,
          summaryCostCents: 1.0,
          tier2Calls: 1,
        }),
        update: expect.objectContaining({
          summaryCalls: { increment: 1 },
          summaryCostCents: { increment: 1.0 },
        }),
      }),
    );
  });

  it("retries with update on unique constraint race condition", async () => {
    const p2002Error = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "6.0.0",
    });
    prismaMock.agentCostTracker.upsert.mockRejectedValueOnce(p2002Error);
    prismaMock.agentCostTracker.update.mockResolvedValueOnce({
      organizationId: "org-1",
      totalCostCents: 1.5,
    });

    const result = await service.recordCost({
      organizationId: "org-1",
      modelTier: "tier2",
      costCents: 0.5,
    });

    expect(result.totalCostCents).toBe(1.5);
    expect(prismaMock.agentCostTracker.upsert).toHaveBeenCalledTimes(1);
    expect(prismaMock.agentCostTracker.update).toHaveBeenCalledTimes(1);
  });

  it("rethrows non-P2002 errors", async () => {
    prismaMock.agentCostTracker.upsert.mockRejectedValueOnce(new Error("connection lost"));

    await expect(
      service.recordCost({
        organizationId: "org-1",
        modelTier: "tier2",
        costCents: 0.5,
      }),
    ).rejects.toThrow("connection lost");
  });

  it("checks budget with 80 cents spent of 100 limit — returns 20%", async () => {
    prismaMock.agentIdentity.findUnique.mockResolvedValueOnce({
      dailyLimitCents: 100,
    });
    prismaMock.agentCostTracker.findUnique.mockResolvedValueOnce({
      totalCostCents: 80,
    });

    const budget = await service.checkBudget("org-1");

    expect(budget.dailyLimitCents).toBe(100);
    expect(budget.spentCents).toBe(80);
    expect(budget.remainingCents).toBe(20);
    expect(budget.remainingPercent).toBe(20);
  });

  it("checks budget with no spending — returns 100%", async () => {
    prismaMock.agentIdentity.findUnique.mockResolvedValueOnce({
      dailyLimitCents: 1000,
    });
    prismaMock.agentCostTracker.findUnique.mockResolvedValueOnce(null);

    const budget = await service.checkBudget("org-1");

    expect(budget.dailyLimitCents).toBe(1000);
    expect(budget.spentCents).toBe(0);
    expect(budget.remainingCents).toBe(1000);
    expect(budget.remainingPercent).toBe(100);
  });

  it("checks budget with no agent identity — uses default 1000", async () => {
    prismaMock.agentIdentity.findUnique.mockResolvedValueOnce(null);
    prismaMock.agentCostTracker.findUnique.mockResolvedValueOnce(null);

    const budget = await service.checkBudget("org-1");

    expect(budget.dailyLimitCents).toBe(1000);
    expect(budget.remainingPercent).toBe(100);
  });

  it("gets cost trackers by date range", async () => {
    prismaMock.agentCostTracker.findMany.mockResolvedValueOnce([]);

    await service.getByDateRange({
      organizationId: "org-1",
      startDate: "2026-03-01",
      endDate: "2026-03-21",
    });

    expect(prismaMock.agentCostTracker.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: "org-1",
        date: { gte: "2026-03-01", lte: "2026-03-21" },
      },
      orderBy: { date: "asc" },
    });
  });
});
