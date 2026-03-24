ALTER TYPE "AgentStatus" ADD VALUE IF NOT EXISTS 'not_started';

UPDATE "Session"
SET "agentStatus" = 'not_started'::"AgentStatus"
WHERE "sessionStatus" = 'not_started'::"SessionStatus"
  AND "agentStatus" = 'done'::"AgentStatus";

UPDATE "Session"
SET "sessionStatus" = 'in_progress'::"SessionStatus"
WHERE "sessionStatus" = 'not_started'::"SessionStatus";

CREATE TYPE "SessionStatus_new" AS ENUM ('in_progress', 'needs_input', 'in_review', 'merged');

ALTER TABLE "Session"
ALTER COLUMN "sessionStatus" TYPE "SessionStatus_new"
USING ("sessionStatus"::text::"SessionStatus_new");

DROP TYPE "SessionStatus";
ALTER TYPE "SessionStatus_new" RENAME TO "SessionStatus";

ALTER TABLE "Session" ALTER COLUMN "agentStatus" SET DEFAULT 'not_started';
ALTER TABLE "Session" ALTER COLUMN "sessionStatus" SET DEFAULT 'in_progress';
