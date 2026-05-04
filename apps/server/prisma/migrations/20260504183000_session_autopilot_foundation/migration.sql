CREATE TYPE "ProjectTicketGenerationStatus" AS ENUM (
  'pending',
  'running',
  'completed',
  'partial_failed',
  'failed'
);

CREATE TYPE "ProjectTicketExecutionStatus" AS ENUM (
  'queued',
  'ready',
  'running',
  'reviewing',
  'fixing',
  'needs_human',
  'blocked',
  'completed',
  'failed',
  'cancelled'
);

ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'project_ticket_generation_started';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'project_ticket_generation_completed';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'project_ticket_generation_failed';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'project_ticket_execution_created';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'project_ticket_execution_updated';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'project_ticket_lifecycle_event';

ALTER TABLE "Organization"
  ADD COLUMN "defaultPlaybookVersionId" TEXT;

ALTER TABLE "Project"
  ADD COLUMN "defaultPlaybookVersionId" TEXT;

ALTER TABLE "ProjectRun"
  ADD COLUMN "planningSessionId" TEXT,
  ADD COLUMN "playbookVersionId" TEXT,
  ADD COLUMN "playbookSnapshot" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "Ticket"
  ADD COLUMN "sourceProjectRunId" TEXT,
  ADD COLUMN "generationAttemptId" TEXT,
  ADD COLUMN "generationDraftKey" TEXT;

CREATE TABLE "ProjectTicketGenerationAttempt" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "projectRunId" TEXT NOT NULL,
  "status" "ProjectTicketGenerationStatus" NOT NULL DEFAULT 'pending',
  "approvedPlan" TEXT NOT NULL,
  "draftCount" INTEGER NOT NULL DEFAULT 0,
  "createdTicketIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "draftSnapshot" JSONB NOT NULL DEFAULT '[]',
  "error" TEXT,
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectTicketGenerationAttempt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectTicketExecution" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "projectRunId" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "status" "ProjectTicketExecutionStatus" NOT NULL DEFAULT 'queued',
  "sequence" INTEGER NOT NULL DEFAULT 0,
  "implementationSessionId" TEXT,
  "reviewSessionId" TEXT,
  "fixSessionId" TEXT,
  "previousStatus" "ProjectTicketExecutionStatus",
  "lastLifecycleEventId" TEXT,
  "lastError" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectTicketExecution_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Playbook" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "isBuiltIn" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Playbook_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlaybookVersion" (
  "id" TEXT NOT NULL,
  "playbookId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "content" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlaybookVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectTicketGenerationAttempt_projectRunId_key"
  ON "ProjectTicketGenerationAttempt"("projectRunId");
CREATE INDEX "ProjectTicketGenerationAttempt_organizationId_status_idx"
  ON "ProjectTicketGenerationAttempt"("organizationId", "status");
CREATE INDEX "ProjectTicketGenerationAttempt_projectId_updatedAt_idx"
  ON "ProjectTicketGenerationAttempt"("projectId", "updatedAt");

CREATE UNIQUE INDEX "ProjectTicketExecution_projectRunId_ticketId_key"
  ON "ProjectTicketExecution"("projectRunId", "ticketId");
CREATE INDEX "ProjectTicketExecution_organizationId_status_idx"
  ON "ProjectTicketExecution"("organizationId", "status");
CREATE INDEX "ProjectTicketExecution_projectRunId_sequence_idx"
  ON "ProjectTicketExecution"("projectRunId", "sequence");
CREATE INDEX "ProjectTicketExecution_implementationSessionId_idx"
  ON "ProjectTicketExecution"("implementationSessionId");
CREATE INDEX "ProjectTicketExecution_reviewSessionId_idx"
  ON "ProjectTicketExecution"("reviewSessionId");
CREATE INDEX "ProjectTicketExecution_fixSessionId_idx"
  ON "ProjectTicketExecution"("fixSessionId");
CREATE INDEX "ProjectTicketExecution_lastLifecycleEventId_idx"
  ON "ProjectTicketExecution"("lastLifecycleEventId");
CREATE UNIQUE INDEX "ProjectTicketExecution_one_active_per_run_idx"
  ON "ProjectTicketExecution"("projectRunId")
  WHERE "status" IN ('running', 'reviewing', 'fixing', 'needs_human', 'blocked');

CREATE INDEX "Playbook_organizationId_idx" ON "Playbook"("organizationId");
CREATE UNIQUE INDEX "Playbook_organizationId_name_key" ON "Playbook"("organizationId", "name");
CREATE UNIQUE INDEX "PlaybookVersion_playbookId_version_key"
  ON "PlaybookVersion"("playbookId", "version");

CREATE UNIQUE INDEX "Ticket_generationAttemptId_generationDraftKey_key"
  ON "Ticket"("generationAttemptId", "generationDraftKey");
CREATE INDEX "Ticket_sourceProjectRunId_idx" ON "Ticket"("sourceProjectRunId");
CREATE INDEX "Ticket_generationAttemptId_idx" ON "Ticket"("generationAttemptId");

ALTER TABLE "Organization"
  ADD CONSTRAINT "Organization_defaultPlaybookVersionId_fkey"
  FOREIGN KEY ("defaultPlaybookVersionId") REFERENCES "PlaybookVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Project"
  ADD CONSTRAINT "Project_defaultPlaybookVersionId_fkey"
  FOREIGN KEY ("defaultPlaybookVersionId") REFERENCES "PlaybookVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProjectRun"
  ADD CONSTRAINT "ProjectRun_planningSessionId_fkey"
  FOREIGN KEY ("planningSessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectRun"
  ADD CONSTRAINT "ProjectRun_playbookVersionId_fkey"
  FOREIGN KEY ("playbookVersionId") REFERENCES "PlaybookVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProjectTicketGenerationAttempt"
  ADD CONSTRAINT "ProjectTicketGenerationAttempt_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectTicketGenerationAttempt"
  ADD CONSTRAINT "ProjectTicketGenerationAttempt_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectTicketGenerationAttempt"
  ADD CONSTRAINT "ProjectTicketGenerationAttempt_projectRunId_fkey"
  FOREIGN KEY ("projectRunId") REFERENCES "ProjectRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectTicketExecution"
  ADD CONSTRAINT "ProjectTicketExecution_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectTicketExecution"
  ADD CONSTRAINT "ProjectTicketExecution_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectTicketExecution"
  ADD CONSTRAINT "ProjectTicketExecution_projectRunId_fkey"
  FOREIGN KEY ("projectRunId") REFERENCES "ProjectRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectTicketExecution"
  ADD CONSTRAINT "ProjectTicketExecution_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectTicketExecution"
  ADD CONSTRAINT "ProjectTicketExecution_implementationSessionId_fkey"
  FOREIGN KEY ("implementationSessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectTicketExecution"
  ADD CONSTRAINT "ProjectTicketExecution_reviewSessionId_fkey"
  FOREIGN KEY ("reviewSessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectTicketExecution"
  ADD CONSTRAINT "ProjectTicketExecution_fixSessionId_fkey"
  FOREIGN KEY ("fixSessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectTicketExecution"
  ADD CONSTRAINT "ProjectTicketExecution_lastLifecycleEventId_fkey"
  FOREIGN KEY ("lastLifecycleEventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Playbook"
  ADD CONSTRAINT "Playbook_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlaybookVersion"
  ADD CONSTRAINT "PlaybookVersion_playbookId_fkey"
  FOREIGN KEY ("playbookId") REFERENCES "Playbook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Ticket"
  ADD CONSTRAINT "Ticket_sourceProjectRunId_fkey"
  FOREIGN KEY ("sourceProjectRunId") REFERENCES "ProjectRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Ticket"
  ADD CONSTRAINT "Ticket_generationAttemptId_fkey"
  FOREIGN KEY ("generationAttemptId") REFERENCES "ProjectTicketGenerationAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;
