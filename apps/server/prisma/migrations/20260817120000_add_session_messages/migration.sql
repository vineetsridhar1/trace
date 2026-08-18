-- Durable session conversation records. Event remains the synchronization and
-- activity log; sourceEventId lets the resumable backfill be safely re-run.
CREATE TYPE "SessionMessageRole" AS ENUM ('user', 'assistant', 'system');

CREATE TABLE "SessionMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "role" "SessionMessageRole" NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "actorId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "attachments" JSONB,
    "sourceEventId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SessionMessage_sourceEventId_key" ON "SessionMessage"("sourceEventId");
CREATE INDEX "SessionMessage_sessionId_createdAt_id_idx" ON "SessionMessage"("sessionId", "createdAt", "id");
CREATE INDEX "SessionMessage_organizationId_createdAt_id_idx" ON "SessionMessage"("organizationId", "createdAt", "id");

ALTER TABLE "SessionMessage"
  ADD CONSTRAINT "SessionMessage_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
