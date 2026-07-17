ALTER TABLE "SessionGroup"
ADD COLUMN "designPreviewStatus" TEXT,
ADD COLUMN "designPreviewKey" TEXT,
ADD COLUMN "designPreviewCommitSha" TEXT,
ADD COLUMN "designPreviewCapturedAt" TIMESTAMP(3);
