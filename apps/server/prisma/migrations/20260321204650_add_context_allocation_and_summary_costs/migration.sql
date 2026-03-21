-- AlterTable
ALTER TABLE "AgentCostTracker" ADD COLUMN     "summaryCalls" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "summaryCostCents" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "AgentExecutionLog" ADD COLUMN     "contextTokenAllocation" JSONB NOT NULL DEFAULT '{}';
