CREATE TYPE "OrchestratorEpisodeStatus" AS ENUM (
  'pending',
  'starting',
  'running',
  'completed',
  'failed'
);

ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'orchestrator_episode_created';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'orchestrator_episode_updated';

CREATE TABLE "OrchestratorEpisode" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "projectRunId" TEXT NOT NULL,
  "triggerEventId" TEXT NOT NULL,
  "sessionId" TEXT,
  "status" "OrchestratorEpisodeStatus" NOT NULL DEFAULT 'pending',
  "playbookVersionId" TEXT,
  "playbookSnapshot" JSONB NOT NULL DEFAULT '{}',
  "contextHash" TEXT,
  "contextSnapshot" JSONB NOT NULL DEFAULT '{}',
  "actionResults" JSONB NOT NULL DEFAULT '[]',
  "decisionSummary" TEXT,
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OrchestratorEpisode_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "OrchestratorEpisode"
  ADD CONSTRAINT "OrchestratorEpisode_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrchestratorEpisode"
  ADD CONSTRAINT "OrchestratorEpisode_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrchestratorEpisode"
  ADD CONSTRAINT "OrchestratorEpisode_projectRunId_fkey"
  FOREIGN KEY ("projectRunId") REFERENCES "ProjectRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrchestratorEpisode"
  ADD CONSTRAINT "OrchestratorEpisode_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "OrchestratorEpisode_triggerEventId_key"
  ON "OrchestratorEpisode"("triggerEventId");

CREATE INDEX "OrchestratorEpisode_organizationId_projectRunId_createdAt_idx"
  ON "OrchestratorEpisode"("organizationId", "projectRunId", "createdAt");

CREATE INDEX "OrchestratorEpisode_projectId_status_idx"
  ON "OrchestratorEpisode"("projectId", "status");

CREATE INDEX "OrchestratorEpisode_sessionId_idx"
  ON "OrchestratorEpisode"("sessionId");
