import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

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
        }),
        update: expect.objectContaining({
          totalCostCents: { increment: 0.5 },
          tier2Calls: { increment: 1 },
          tier2CostCents: { increment: 0.5 },
          tier3Calls: { increment: 0 },
          tier3CostCents: { increment: 0 },
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
    });

    await service.recordCost({
      organizationId: "org-1",
      modelTier: "tier3",
      costCents: 5.0,
    });

    expect(prismaMock.agentCostTracker.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          tier2Calls: 0,
          tier2CostCents: 0,
          tier3Calls: 1,
          tier3CostCents: 5.0,
        }),
      }),
    );
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
