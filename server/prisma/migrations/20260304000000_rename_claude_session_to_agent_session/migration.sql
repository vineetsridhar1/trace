-- Rename claude_session_id to agent_session_id on messages (Workspace)
ALTER TABLE "messages" RENAME COLUMN "claude_session_id" TO "agent_session_id";

-- Add agent_type to messages (Workspace)
ALTER TABLE "messages" ADD COLUMN "agent_type" VARCHAR;

-- Add agent_type to events
ALTER TABLE "events" ADD COLUMN "agent_type" VARCHAR;

-- Backfill: mark existing rows with a non-null session ID as claude
UPDATE "messages" SET "agent_type" = 'claude' WHERE "agent_session_id" IS NOT NULL;

-- Index for filtering events by agent type
CREATE INDEX "events_agent_type_idx" ON "events"("agent_type");
