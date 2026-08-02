ALTER TABLE "Artifact"
  ADD COLUMN "approvalStatus" TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN "approvalAction" TEXT,
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "approvedById" TEXT,
  ADD COLUMN "implementationSessionId" TEXT;

CREATE INDEX "Artifact_approvalStatus_idx" ON "Artifact"("approvalStatus");
