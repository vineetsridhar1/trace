ALTER TABLE "GitCheckpoint"
ADD COLUMN "previewStatus" TEXT,
ADD COLUMN "previewKey" TEXT,
ADD COLUMN "previewUrl" TEXT,
ADD COLUMN "previewContentType" TEXT,
ADD COLUMN "previewCapturedAt" TIMESTAMP(3);
