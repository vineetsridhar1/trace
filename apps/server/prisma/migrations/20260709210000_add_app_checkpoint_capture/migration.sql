ALTER TABLE "GitCheckpoint"
ADD COLUMN "captureStatus" TEXT,
ADD COLUMN "captureKey" TEXT,
ADD COLUMN "captureUrl" TEXT,
ADD COLUMN "captureContentType" TEXT,
ADD COLUMN "capturedAt" TIMESTAMP(3);
