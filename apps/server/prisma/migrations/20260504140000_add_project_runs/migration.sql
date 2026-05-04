CREATE TYPE "ProjectRunStatus" AS ENUM (
  'draft',
  'interviewing',
  'planning',
  'ready',
  'running',
  'needs_human',
  'paused',
  'completed',
  'failed',
  'cancelled'
);

ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'project_run_created';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'project_run_updated';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'project_goal_submitted';

CREATE TABLE "ProjectRun" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "status" "ProjectRunStatus" NOT NULL DEFAULT 'draft',
  "initialGoal" TEXT NOT NULL,
  "planSummary" TEXT,
  "activeGateId" TEXT,
  "latestControllerSummaryId" TEXT,
  "latestControllerSummaryText" TEXT,
  "executionConfig" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProjectRun_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ProjectRun"
  ADD CONSTRAINT "ProjectRun_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectRun"
  ADD CONSTRAINT "ProjectRun_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "ProjectRun_organizationId_status_idx" ON "ProjectRun"("organizationId", "status");
CREATE INDEX "ProjectRun_projectId_status_idx" ON "ProjectRun"("projectId", "status");
CREATE INDEX "ProjectRun_projectId_updatedAt_idx" ON "ProjectRun"("projectId", "updatedAt");

CREATE UNIQUE INDEX "ProjectRun_one_active_per_project_idx"
  ON "ProjectRun"("projectId")
  WHERE "status" NOT IN ('completed', 'failed', 'cancelled');
