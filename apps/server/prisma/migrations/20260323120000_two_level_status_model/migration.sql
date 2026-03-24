-- Step 1: Rename the old AgentStatus (enabled/disabled) to OrgAgentStatus
ALTER TYPE "AgentStatus" RENAME TO "OrgAgentStatus";

-- Step 2: Rename old SessionStatus enum to a temp name
ALTER TYPE "SessionStatus" RENAME TO "SessionStatus_old";

-- Step 3: Create the new AgentStatus enum (active, done, failed, stopped)
CREATE TYPE "AgentStatus" AS ENUM ('active', 'done', 'failed', 'stopped');

-- Step 4: Create the new SessionStatus enum
CREATE TYPE "SessionStatus" AS ENUM ('not_started', 'in_progress', 'needs_input', 'in_review', 'merged');

-- Step 5: Add the new columns with defaults
ALTER TABLE "Session" ADD COLUMN "agentStatus" "AgentStatus" NOT NULL DEFAULT 'active';
ALTER TABLE "Session" ADD COLUMN "sessionStatus" "SessionStatus" NOT NULL DEFAULT 'not_started';

-- Step 6: Backfill agentStatus from old status column
UPDATE "Session" SET "agentStatus" = CASE
  WHEN "status"::"text" = 'active' THEN 'active'::"AgentStatus"
  WHEN "status"::"text" = 'completed' THEN 'done'::"AgentStatus"
  WHEN "status"::"text" = 'failed' THEN 'failed'::"AgentStatus"
  WHEN "status"::"text" IN ('creating', 'pending', 'paused', 'unreachable', 'needs_input') THEN 'done'::"AgentStatus"
  WHEN "status"::"text" = 'merged' THEN 'done'::"AgentStatus"
  ELSE 'done'::"AgentStatus"
END;

-- Step 7: Backfill sessionStatus from old status + prUrl
UPDATE "Session" SET "sessionStatus" = CASE
  WHEN "status"::"text" = 'merged' THEN 'merged'::"SessionStatus"
  WHEN "status"::"text" = 'needs_input' THEN 'needs_input'::"SessionStatus"
  WHEN "prUrl" IS NOT NULL THEN 'in_review'::"SessionStatus"
  WHEN "status"::"text" IN ('active', 'paused', 'unreachable', 'completed') THEN 'in_progress'::"SessionStatus"
  WHEN "status"::"text" IN ('creating', 'pending') THEN 'not_started'::"SessionStatus"
  ELSE 'not_started'::"SessionStatus"
END;

-- Step 8: Drop the old status column
ALTER TABLE "Session" DROP COLUMN "status";

-- Step 9: Drop the old enum
DROP TYPE "SessionStatus_old";

-- Note: DB defaults are kept — Prisma @default relies on them for omitted fields.
