-- Move any sessions currently in "in_review" to "completed" (the underlying real status)
UPDATE "Session" SET status = 'completed' WHERE status = 'in_review';

-- Remove "in_review" from the SessionStatus enum
ALTER TYPE "SessionStatus" RENAME TO "SessionStatus_old";
CREATE TYPE "SessionStatus" AS ENUM ('creating', 'pending', 'active', 'paused', 'needs_input', 'completed', 'failed', 'unreachable', 'merged');
ALTER TABLE "Session" ALTER COLUMN status TYPE "SessionStatus" USING status::text::"SessionStatus";
ALTER TABLE "Session" ALTER COLUMN status SET DEFAULT 'pending';
DROP TYPE "SessionStatus_old";

-- Add session_pr_closed to the EventType enum
ALTER TYPE "EventType" ADD VALUE 'session_pr_closed';
