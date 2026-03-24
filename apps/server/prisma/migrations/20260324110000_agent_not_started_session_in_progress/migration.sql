CREATE TYPE "AgentStatus_new" AS ENUM ('not_started', 'active', 'done', 'failed', 'stopped');

ALTER TABLE "Session" ALTER COLUMN "agentStatus" DROP DEFAULT;
ALTER TABLE "Session"
ALTER COLUMN "agentStatus" TYPE "AgentStatus_new"
USING (
  CASE
    WHEN "sessionStatus"::text = 'not_started' AND "agentStatus"::text IN ('active', 'done')
      THEN 'not_started'
    ELSE "agentStatus"::text
  END
)::"AgentStatus_new";

DROP TYPE "AgentStatus";
ALTER TYPE "AgentStatus_new" RENAME TO "AgentStatus";

CREATE TYPE "SessionStatus_new" AS ENUM ('in_progress', 'needs_input', 'in_review', 'merged');

ALTER TABLE "Session" ALTER COLUMN "sessionStatus" DROP DEFAULT;
ALTER TABLE "Session"
ALTER COLUMN "sessionStatus" TYPE "SessionStatus_new"
USING (
  CASE
    WHEN "sessionStatus"::text = 'not_started' THEN 'in_progress'
    ELSE "sessionStatus"::text
  END
)::"SessionStatus_new";

DROP TYPE "SessionStatus";
ALTER TYPE "SessionStatus_new" RENAME TO "SessionStatus";

ALTER TABLE "Session" ALTER COLUMN "agentStatus" SET DEFAULT 'not_started';
ALTER TABLE "Session" ALTER COLUMN "sessionStatus" SET DEFAULT 'in_progress';
