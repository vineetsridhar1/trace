DROP INDEX IF EXISTS "Session_pendingGeneralWorkspaceCleanupRuntimeId_idx";

ALTER TABLE "Session"
DROP COLUMN IF EXISTS "pendingGeneralWorkspaceCleanupRuntimeId";
