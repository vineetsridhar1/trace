-- CreateEnum
CREATE TYPE "ModelTier" AS ENUM ('tier2', 'tier3');

-- CreateEnum
CREATE TYPE "ExecutionDisposition" AS ENUM ('ignore', 'suggest', 'act', 'summarize', 'escalate');

-- CreateEnum
CREATE TYPE "ExecutionStatus" AS ENUM ('succeeded', 'suggested', 'blocked', 'dropped', 'failed');

-- AlterTable
ALTER TABLE "AgentIdentity" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "AgentExecutionLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "triggerEventId" TEXT NOT NULL,
    "batchSize" INTEGER NOT NULL DEFAULT 1,
    "agentId" TEXT NOT NULL,
    "modelTier" "ModelTier" NOT NULL,
    "model" TEXT NOT NULL,
    "promoted" BOOLEAN NOT NULL DEFAULT false,
    "promotionReason" TEXT,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "estimatedCostCents" DOUBLE PRECISION NOT NULL,
    "disposition" "ExecutionDisposition" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "plannedActions" JSONB NOT NULL DEFAULT '[]',
    "policyDecision" JSONB NOT NULL DEFAULT '{}',
    "finalActions" JSONB NOT NULL DEFAULT '[]',
    "status" "ExecutionStatus" NOT NULL,
    "inboxItemId" TEXT,
    "latencyMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentExecutionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessedAgentEvent" (
    "consumerName" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "resultHash" TEXT,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedAgentEvent_pkey" PRIMARY KEY ("consumerName","eventId")
);

-- CreateTable
CREATE TABLE "AgentCostTracker" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "totalCostCents" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tier2Calls" INTEGER NOT NULL DEFAULT 0,
    "tier2CostCents" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tier3Calls" INTEGER NOT NULL DEFAULT 0,
    "tier3CostCents" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentCostTracker_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentExecutionLog_organizationId_createdAt_idx" ON "AgentExecutionLog"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentExecutionLog_triggerEventId_idx" ON "AgentExecutionLog"("triggerEventId");

-- CreateIndex
CREATE INDEX "AgentExecutionLog_organizationId_agentId_status_idx" ON "AgentExecutionLog"("organizationId", "agentId", "status");

-- CreateIndex
CREATE INDEX "ProcessedAgentEvent_organizationId_processedAt_idx" ON "ProcessedAgentEvent"("organizationId", "processedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentCostTracker_organizationId_date_key" ON "AgentCostTracker"("organizationId", "date");

-- AddForeignKey
ALTER TABLE "AgentExecutionLog" ADD CONSTRAINT "AgentExecutionLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessedAgentEvent" ADD CONSTRAINT "ProcessedAgentEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentCostTracker" ADD CONSTRAINT "AgentCostTracker_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
