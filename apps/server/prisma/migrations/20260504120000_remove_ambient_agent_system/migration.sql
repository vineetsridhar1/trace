DROP TABLE IF EXISTS "AgentLlmCall" CASCADE;
DROP TABLE IF EXISTS "AgentExecutionLog" CASCADE;
DROP TABLE IF EXISTS "AgentCostTracker" CASCADE;
DROP TABLE IF EXISTS "AgentIdentity" CASCADE;
DROP TABLE IF EXISTS "ProcessedAgentEvent" CASCADE;
DROP TABLE IF EXISTS "EntitySummary" CASCADE;
DROP TABLE IF EXISTS "DerivedMemory" CASCADE;
DROP TABLE IF EXISTS "MemoryExtractionCursor" CASCADE;

ALTER TABLE "Project" DROP COLUMN IF EXISTS "aiMode";
ALTER TABLE "Channel" DROP COLUMN IF EXISTS "aiMode";
ALTER TABLE "Ticket" DROP COLUMN IF EXISTS "aiMode";
ALTER TABLE "Chat" DROP COLUMN IF EXISTS "aiMode";

DELETE FROM "InboxItem"
WHERE "itemType" IN (
  'agent_escalation',
  'agent_suggestion',
  'ticket_suggestion',
  'link_suggestion',
  'session_suggestion',
  'field_change_suggestion',
  'comment_suggestion',
  'message_suggestion'
);

ALTER TYPE "InboxItemType" RENAME TO "InboxItemType_old";
CREATE TYPE "InboxItemType" AS ENUM ('plan', 'question');
ALTER TABLE "InboxItem"
  ALTER COLUMN "itemType" TYPE "InboxItemType"
  USING "itemType"::text::"InboxItemType";
DROP TYPE "InboxItemType_old";

DROP TYPE IF EXISTS "OrgAgentStatus";
DROP TYPE IF EXISTS "AutonomyMode";
DROP TYPE IF EXISTS "ModelTier";
DROP TYPE IF EXISTS "MemoryKind";
DROP TYPE IF EXISTS "ExecutionDisposition";
DROP TYPE IF EXISTS "ExecutionStatus";
DROP TYPE IF EXISTS "SummaryType";
