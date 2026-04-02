import type { ModelTier } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/db.js";

export interface RecordCostInput {
  organizationId: string;
  modelTier: ModelTier;
  costCents: number;
  isSummary?: boolean;
}

export interface BudgetStatus {
  dailyLimitCents: number;
  spentCents: number;
  remainingCents: number;
  remainingPercent: number;
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export class CostTrackingService {
  /**
   * Record cost for a planner call. Atomically upserts the daily cost tracker.
   * Retries on unique constraint race condition (two concurrent creates).
   */
  async recordCost(input: RecordCostInput) {
    const date = todayDateString();
    const tier2Inc = input.modelTier === "tier2" ? 1 : 0;
    const tier3Inc = input.modelTier === "tier3" ? 1 : 0;
    const tier2CostInc = input.modelTier === "tier2" ? input.costCents : 0;
    const tier3CostInc = input.modelTier === "tier3" ? input.costCents : 0;
    const summaryInc = input.isSummary ? 1 : 0;
    const summaryCostInc = input.isSummary ? input.costCents : 0;

    const where = {
      organizationId_date: {
        organizationId: input.organizationId,
        date,
      },
    };

    const updateData = {
      totalCostCents: { increment: input.costCents },
      tier2Calls: { increment: tier2Inc },
      tier2CostCents: { increment: tier2CostInc },
      tier3Calls: { increment: tier3Inc },
      tier3CostCents: { increment: tier3CostInc },
      summaryCalls: { increment: summaryInc },
      summaryCostCents: { increment: summaryCostInc },
    };

    try {
      return await prisma.agentCostTracker.upsert({
        where,
        create: {
          organizationId: input.organizationId,
          date,
          totalCostCents: input.costCents,
          tier2Calls: tier2Inc,
          tier2CostCents: tier2CostInc,
          tier3Calls: tier3Inc,
          tier3CostCents: tier3CostInc,
          summaryCalls: summaryInc,
          summaryCostCents: summaryCostInc,
        },
        update: updateData,
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        (e as { code: string }).code === "P2002"
      ) {
        return prisma.agentCostTracker.update({
          where,
          data: updateData,
        });
      }
      throw e;
    }
  }

  /**
   * Check remaining budget for an org on today's date.
   * Returns budget status including remaining percentage.
   */
  async checkBudget(organizationId: string): Promise<BudgetStatus> {
    const agent = await prisma.agentIdentity.findUnique({
      where: { organizationId },
      select: { dailyLimitCents: true },
    });

    const dailyLimitCents = agent?.dailyLimitCents ?? 1000;

    const date = todayDateString();
    const tracker = await prisma.agentCostTracker.findUnique({
      where: {
        organizationId_date: { organizationId, date },
      },
    });

    const spentCents = tracker?.totalCostCents ?? 0;
    const remainingCents = Math.max(0, dailyLimitCents - spentCents);
    const remainingPercent =
      dailyLimitCents > 0 ? (remainingCents / dailyLimitCents) * 100 : 0;

    return {
      dailyLimitCents,
      spentCents,
      remainingCents,
      remainingPercent,
    };
  }

  /**
   * Get cost tracker for a specific org and date range.
   */
  async getByDateRange(input: {
    organizationId: string;
    startDate: string;
    endDate: string;
  }) {
    return prisma.agentCostTracker.findMany({
      where: {
        organizationId: input.organizationId,
        date: {
          gte: input.startDate,
          lte: input.endDate,
        },
      },
      orderBy: { date: "asc" },
    });
  }
}

export const costTrackingService = new CostTrackingService();
