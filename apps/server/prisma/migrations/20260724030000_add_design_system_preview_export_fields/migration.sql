-- AlterTable
ALTER TABLE "SessionGroup" ADD COLUMN     "designPreviewPendingKey" TEXT,
ADD COLUMN     "designPreviewRequestId" TEXT,
ADD COLUMN     "designPreviewError" TEXT;
