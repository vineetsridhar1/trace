CREATE TYPE "PreviewStatus" AS ENUM ('starting', 'ready', 'failed', 'stopping', 'stopped');

CREATE TYPE "PreviewVisibility" AS ENUM ('org', 'public');

ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'preview_created';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'preview_process_started';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'preview_ready';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'preview_failed';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'preview_stopping';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'preview_stopped';

CREATE TABLE "Preview" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "sessionGroupId" TEXT,
  "createdById" TEXT NOT NULL,
  "command" TEXT NOT NULL,
  "cwd" TEXT,
  "port" INTEGER NOT NULL,
  "visibility" "PreviewVisibility" NOT NULL,
  "status" "PreviewStatus" NOT NULL DEFAULT 'starting',
  "url" TEXT,
  "routeId" TEXT,
  "terminalId" TEXT,
  "startedAt" TIMESTAMP(3),
  "stoppedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Preview_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Preview_organizationId_sessionId_status_idx" ON "Preview"("organizationId", "sessionId", "status");
CREATE INDEX "Preview_sessionGroupId_updatedAt_idx" ON "Preview"("sessionGroupId", "updatedAt");
CREATE INDEX "Preview_createdById_createdAt_idx" ON "Preview"("createdById", "createdAt");

ALTER TABLE "Preview" ADD CONSTRAINT "Preview_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Preview" ADD CONSTRAINT "Preview_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Preview" ADD CONSTRAINT "Preview_sessionGroupId_fkey" FOREIGN KEY ("sessionGroupId") REFERENCES "SessionGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Preview" ADD CONSTRAINT "Preview_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
