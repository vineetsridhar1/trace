ALTER TABLE "SessionGroup"
ADD COLUMN "designPreviewStatus" TEXT,
ADD COLUMN "designPreviewKey" TEXT,
ADD COLUMN "designPreviewCommitSha" TEXT,
ADD COLUMN "designPreviewCapturedAt" TIMESTAMP(3),
ADD COLUMN "designPreviewAttemptedAt" TIMESTAMP(3);

CREATE INDEX "SessionGroup_kind_designPreviewStatus_idx"
ON "SessionGroup"("kind", "designPreviewStatus");

ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'design_preview_updated';
