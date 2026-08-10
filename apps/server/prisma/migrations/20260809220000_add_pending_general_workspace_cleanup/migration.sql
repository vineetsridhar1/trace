ALTER TABLE "Session"
ADD COLUMN "pendingGeneralWorkspaceCleanupRuntimeId" TEXT;

CREATE INDEX "Session_pendingGeneralWorkspaceCleanupRuntimeId_idx"
ON "Session"("pendingGeneralWorkspaceCleanupRuntimeId");
