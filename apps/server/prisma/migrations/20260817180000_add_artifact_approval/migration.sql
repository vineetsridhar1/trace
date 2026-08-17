ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'artifact_approved';

CREATE TYPE "ArtifactApprovalStatus" AS ENUM ('PENDING', 'PROCESSING', 'APPROVED');
CREATE TYPE "ArtifactApprovalAction" AS ENUM ('NEW_SESSION', 'KEEP_CONTEXT');

ALTER TABLE "Artifact"
ADD COLUMN IF NOT EXISTS "approvalStatus" "ArtifactApprovalStatus",
ADD COLUMN IF NOT EXISTS "approvalAction" "ArtifactApprovalAction",
ADD COLUMN IF NOT EXISTS "approvalPromptDigest" TEXT,
ADD COLUMN IF NOT EXISTS "processingStartedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "approvedById" TEXT,
ADD COLUMN IF NOT EXISTS "implementationSessionId" TEXT;

UPDATE "Artifact"
SET "approvalStatus" = 'PENDING'
WHERE "type" = 'trace.visual-plan.v1' AND "approvalStatus" IS NULL;

CREATE INDEX IF NOT EXISTS "Artifact_approvalStatus_idx" ON "Artifact"("approvalStatus");
CREATE INDEX IF NOT EXISTS "Artifact_approvedById_idx" ON "Artifact"("approvedById");
CREATE INDEX IF NOT EXISTS "Artifact_implementationSessionId_idx" ON "Artifact"("implementationSessionId");

ALTER TABLE "Artifact"
ADD CONSTRAINT "Artifact_approvedById_fkey"
FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "Artifact_implementationSessionId_fkey"
FOREIGN KEY ("implementationSessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;
