-- AlterEnum
ALTER TYPE "EventType" ADD VALUE 'animation_preview_updated';

-- AlterTable
ALTER TABLE "SessionGroup" ADD COLUMN     "animationPreviewAttemptedAt" TIMESTAMP(3),
ADD COLUMN     "animationPreviewCapturedAt" TIMESTAMP(3),
ADD COLUMN     "animationPreviewCommitSha" TEXT,
ADD COLUMN     "animationPreviewError" TEXT,
ADD COLUMN     "animationPreviewKey" TEXT,
ADD COLUMN     "animationPreviewPendingKey" TEXT,
ADD COLUMN     "animationPreviewRequestId" TEXT,
ADD COLUMN     "animationPreviewStatus" TEXT;

-- CreateIndex
CREATE INDEX "SessionGroup_kind_animationPreviewStatus_idx" ON "SessionGroup"("kind", "animationPreviewStatus");
