CREATE TYPE "AppDeploymentStatus" AS ENUM (
  'queued',
  'building',
  'deploying',
  'live',
  'failed',
  'superseded',
  'stopped'
);

ALTER TYPE "EventType" ADD VALUE 'app_deployment_queued';
ALTER TYPE "EventType" ADD VALUE 'app_deployment_updated';

CREATE TABLE "AppDeployment" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "sessionGroupId" TEXT NOT NULL,
  "repoId" TEXT NOT NULL,
  "sourceCheckpointId" TEXT NOT NULL,
  "commitSha" TEXT NOT NULL,
  "status" "AppDeploymentStatus" NOT NULL DEFAULT 'queued',
  "requestedByUserId" TEXT NOT NULL,
  "callbackTokenHash" TEXT NOT NULL,
  "externalJobId" TEXT,
  "imageDigest" TEXT,
  "url" TEXT,
  "errorMessage" TEXT,
  "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AppDeployment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AppDeployment_organizationId_sessionGroupId_createdAt_idx"
  ON "AppDeployment"("organizationId", "sessionGroupId", "createdAt");
CREATE INDEX "AppDeployment_sessionGroupId_status_idx"
  ON "AppDeployment"("sessionGroupId", "status");
CREATE INDEX "AppDeployment_sourceCheckpointId_idx"
  ON "AppDeployment"("sourceCheckpointId");
CREATE UNIQUE INDEX "AppDeployment_one_active_per_group_idx"
  ON "AppDeployment"("sessionGroupId")
  WHERE "status" IN ('queued', 'building', 'deploying');

ALTER TABLE "AppDeployment"
  ADD CONSTRAINT "AppDeployment_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AppDeployment"
  ADD CONSTRAINT "AppDeployment_sessionGroupId_fkey"
  FOREIGN KEY ("sessionGroupId") REFERENCES "SessionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AppDeployment"
  ADD CONSTRAINT "AppDeployment_repoId_fkey"
  FOREIGN KEY ("repoId") REFERENCES "Repo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AppDeployment"
  ADD CONSTRAINT "AppDeployment_sourceCheckpointId_fkey"
  FOREIGN KEY ("sourceCheckpointId") REFERENCES "GitCheckpoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
