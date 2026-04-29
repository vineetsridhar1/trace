-- CreateEnum
CREATE TYPE "SessionRole" AS ENUM ('primary', 'ticket_worker', 'ultraplan_controller_run');

-- CreateEnum
CREATE TYPE "UltraplanStatus" AS ENUM ('draft', 'waiting', 'planning', 'running', 'needs_human', 'integrating', 'paused', 'completed', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "ControllerRunStatus" AS ENUM ('queued', 'running', 'completed', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "TicketExecutionStatus" AS ENUM ('queued', 'running', 'reviewing', 'needs_human', 'ready_to_integrate', 'integrating', 'integrated', 'blocked', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "UltraplanTicketStatus" AS ENUM ('planned', 'ready', 'running', 'blocked', 'completed', 'skipped', 'cancelled');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('not_started', 'running', 'conflicted', 'completed', 'failed');

-- AlterEnum
ALTER TYPE "ScopeType" ADD VALUE IF NOT EXISTS 'ultraplan';

-- AlterEnum
ALTER TYPE "InboxItemType" ADD VALUE IF NOT EXISTS 'ultraplan_plan_approval';
ALTER TYPE "InboxItemType" ADD VALUE IF NOT EXISTS 'ultraplan_validation_request';
ALTER TYPE "InboxItemType" ADD VALUE IF NOT EXISTS 'ultraplan_conflict_resolution';
ALTER TYPE "InboxItemType" ADD VALUE IF NOT EXISTS 'ultraplan_final_review';

-- AlterEnum
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'ultraplan_created';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'ultraplan_updated';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'ultraplan_paused';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'ultraplan_resumed';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'ultraplan_completed';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'ultraplan_failed';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'ultraplan_controller_run_created';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'ultraplan_controller_run_started';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'ultraplan_controller_run_completed';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'ultraplan_controller_run_failed';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'ultraplan_ticket_created';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'ultraplan_ticket_updated';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'ultraplan_ticket_reordered';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'ticket_execution_created';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'ticket_execution_updated';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'ticket_execution_ready_for_review';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'ticket_execution_integration_requested';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'ticket_execution_integrated';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'ticket_execution_blocked';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'ultraplan_human_gate_requested';

-- AlterTable
ALTER TABLE "Session" ADD COLUMN "role" "SessionRole" NOT NULL DEFAULT 'primary';

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN "acceptanceCriteria" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "testPlan" TEXT;

-- CreateTable
CREATE TABLE "TicketDependency" (
    "ticketId" TEXT NOT NULL,
    "dependsOnTicketId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketDependency_pkey" PRIMARY KEY ("ticketId", "dependsOnTicketId")
);

-- CreateTable
CREATE TABLE "Ultraplan" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sessionGroupId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "status" "UltraplanStatus" NOT NULL DEFAULT 'draft',
    "integrationBranch" TEXT NOT NULL,
    "integrationWorkdir" TEXT,
    "playbookId" TEXT,
    "playbookConfig" JSONB,
    "planSummary" TEXT,
    "customInstructions" TEXT,
    "activeInboxItemId" TEXT,
    "lastControllerRunId" TEXT,
    "lastControllerSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ultraplan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UltraplanTicket" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ultraplanId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "status" "UltraplanTicketStatus" NOT NULL DEFAULT 'planned',
    "generatedByRunId" TEXT,
    "rationale" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UltraplanTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UltraplanControllerRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ultraplanId" TEXT NOT NULL,
    "sessionGroupId" TEXT NOT NULL,
    "sessionId" TEXT,
    "triggerEventId" TEXT,
    "triggerType" TEXT NOT NULL,
    "status" "ControllerRunStatus" NOT NULL DEFAULT 'queued',
    "inputSummary" TEXT,
    "summaryTitle" TEXT,
    "summary" TEXT,
    "summaryPayload" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "UltraplanControllerRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketExecution" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ultraplanId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "sessionGroupId" TEXT NOT NULL,
    "workerSessionId" TEXT,
    "branch" TEXT NOT NULL,
    "workdir" TEXT,
    "status" "TicketExecutionStatus" NOT NULL DEFAULT 'queued',
    "integrationStatus" "IntegrationStatus" NOT NULL DEFAULT 'not_started',
    "baseCheckpointSha" TEXT,
    "headCheckpointSha" TEXT,
    "integrationCheckpointSha" TEXT,
    "activeInboxItemId" TEXT,
    "lastReviewSummary" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketExecution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TicketDependency_dependsOnTicketId_idx" ON "TicketDependency"("dependsOnTicketId");

-- CreateIndex
CREATE INDEX "TicketDependency_organizationId_idx" ON "TicketDependency"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Ultraplan_sessionGroupId_key" ON "Ultraplan"("sessionGroupId");

-- CreateIndex
CREATE INDEX "Ultraplan_organizationId_status_idx" ON "Ultraplan"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "UltraplanTicket_ultraplanId_ticketId_key" ON "UltraplanTicket"("ultraplanId", "ticketId");

-- CreateIndex
CREATE UNIQUE INDEX "UltraplanTicket_ultraplanId_position_key" ON "UltraplanTicket"("ultraplanId", "position");

-- CreateIndex
CREATE INDEX "UltraplanTicket_organizationId_idx" ON "UltraplanTicket"("organizationId");

-- CreateIndex
CREATE INDEX "UltraplanTicket_generatedByRunId_idx" ON "UltraplanTicket"("generatedByRunId");

-- CreateIndex
CREATE INDEX "UltraplanControllerRun_organizationId_createdAt_idx" ON "UltraplanControllerRun"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "UltraplanControllerRun_ultraplanId_status_idx" ON "UltraplanControllerRun"("ultraplanId", "status");

-- CreateIndex
CREATE INDEX "UltraplanControllerRun_sessionGroupId_idx" ON "UltraplanControllerRun"("sessionGroupId");

-- CreateIndex
CREATE INDEX "UltraplanControllerRun_sessionId_idx" ON "UltraplanControllerRun"("sessionId");

-- CreateIndex
CREATE INDEX "UltraplanControllerRun_triggerEventId_idx" ON "UltraplanControllerRun"("triggerEventId");

-- CreateIndex
CREATE INDEX "TicketExecution_organizationId_status_idx" ON "TicketExecution"("organizationId", "status");

-- CreateIndex
CREATE INDEX "TicketExecution_ultraplanId_status_idx" ON "TicketExecution"("ultraplanId", "status");

-- CreateIndex
CREATE INDEX "TicketExecution_ticketId_idx" ON "TicketExecution"("ticketId");

-- CreateIndex
CREATE INDEX "TicketExecution_sessionGroupId_idx" ON "TicketExecution"("sessionGroupId");

-- CreateIndex
CREATE INDEX "TicketExecution_workerSessionId_idx" ON "TicketExecution"("workerSessionId");

-- CreateIndex
CREATE INDEX "TicketExecution_activeInboxItemId_idx" ON "TicketExecution"("activeInboxItemId");

-- AddForeignKey
ALTER TABLE "TicketDependency" ADD CONSTRAINT "TicketDependency_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketDependency" ADD CONSTRAINT "TicketDependency_dependsOnTicketId_fkey" FOREIGN KEY ("dependsOnTicketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketDependency" ADD CONSTRAINT "TicketDependency_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ultraplan" ADD CONSTRAINT "Ultraplan_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ultraplan" ADD CONSTRAINT "Ultraplan_sessionGroupId_fkey" FOREIGN KEY ("sessionGroupId") REFERENCES "SessionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ultraplan" ADD CONSTRAINT "Ultraplan_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ultraplan" ADD CONSTRAINT "Ultraplan_activeInboxItemId_fkey" FOREIGN KEY ("activeInboxItemId") REFERENCES "InboxItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ultraplan" ADD CONSTRAINT "Ultraplan_lastControllerRunId_fkey" FOREIGN KEY ("lastControllerRunId") REFERENCES "UltraplanControllerRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UltraplanTicket" ADD CONSTRAINT "UltraplanTicket_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UltraplanTicket" ADD CONSTRAINT "UltraplanTicket_ultraplanId_fkey" FOREIGN KEY ("ultraplanId") REFERENCES "Ultraplan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UltraplanTicket" ADD CONSTRAINT "UltraplanTicket_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UltraplanTicket" ADD CONSTRAINT "UltraplanTicket_generatedByRunId_fkey" FOREIGN KEY ("generatedByRunId") REFERENCES "UltraplanControllerRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UltraplanControllerRun" ADD CONSTRAINT "UltraplanControllerRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UltraplanControllerRun" ADD CONSTRAINT "UltraplanControllerRun_ultraplanId_fkey" FOREIGN KEY ("ultraplanId") REFERENCES "Ultraplan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UltraplanControllerRun" ADD CONSTRAINT "UltraplanControllerRun_sessionGroupId_fkey" FOREIGN KEY ("sessionGroupId") REFERENCES "SessionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UltraplanControllerRun" ADD CONSTRAINT "UltraplanControllerRun_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UltraplanControllerRun" ADD CONSTRAINT "UltraplanControllerRun_triggerEventId_fkey" FOREIGN KEY ("triggerEventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketExecution" ADD CONSTRAINT "TicketExecution_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketExecution" ADD CONSTRAINT "TicketExecution_ultraplanId_fkey" FOREIGN KEY ("ultraplanId") REFERENCES "Ultraplan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketExecution" ADD CONSTRAINT "TicketExecution_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketExecution" ADD CONSTRAINT "TicketExecution_sessionGroupId_fkey" FOREIGN KEY ("sessionGroupId") REFERENCES "SessionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketExecution" ADD CONSTRAINT "TicketExecution_workerSessionId_fkey" FOREIGN KEY ("workerSessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketExecution" ADD CONSTRAINT "TicketExecution_activeInboxItemId_fkey" FOREIGN KEY ("activeInboxItemId") REFERENCES "InboxItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
