-- CreateEnum
CREATE TYPE "SessionApplicationWorkflowRunStatus" AS ENUM ('running', 'completed', 'failed');

-- AlterEnum
ALTER TYPE "EventType" ADD VALUE 'session_application_workflow_started';
ALTER TYPE "EventType" ADD VALUE 'session_application_workflow_updated';
ALTER TYPE "EventType" ADD VALUE 'session_application_workflow_completed';
ALTER TYPE "EventType" ADD VALUE 'session_application_workflow_failed';

-- AlterTable
ALTER TABLE "SessionSetupScriptRun" ADD COLUMN "workflowRunId" TEXT;

-- AlterTable
ALTER TABLE "SessionApplicationProcess" ADD COLUMN "workflowRunId" TEXT;

-- CreateTable
CREATE TABLE "SessionApplicationWorkflowRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sessionGroupId" TEXT NOT NULL,
    "repoId" TEXT NOT NULL,
    "appConfigId" TEXT NOT NULL,
    "status" "SessionApplicationWorkflowRunStatus" NOT NULL DEFAULT 'running',
    "lastError" TEXT,
    "startedByUserId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionApplicationWorkflowRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SessionSetupScriptRun_workflowRunId_idx" ON "SessionSetupScriptRun"("workflowRunId");

-- CreateIndex
CREATE INDEX "SessionApplicationProcess_workflowRunId_idx" ON "SessionApplicationProcess"("workflowRunId");

-- CreateIndex
CREATE INDEX "SessionApplicationWorkflowRun_organizationId_sessionGroupId_idx" ON "SessionApplicationWorkflowRun"("organizationId", "sessionGroupId");

-- CreateIndex
CREATE INDEX "SessionApplicationWorkflowRun_sessionGroupId_status_idx" ON "SessionApplicationWorkflowRun"("sessionGroupId", "status");

-- AddForeignKey
ALTER TABLE "SessionApplicationWorkflowRun" ADD CONSTRAINT "SessionApplicationWorkflowRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionApplicationWorkflowRun" ADD CONSTRAINT "SessionApplicationWorkflowRun_sessionGroupId_fkey" FOREIGN KEY ("sessionGroupId") REFERENCES "SessionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
