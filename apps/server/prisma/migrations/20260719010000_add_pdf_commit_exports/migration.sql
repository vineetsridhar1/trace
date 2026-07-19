ALTER TABLE "SessionGroup"
ADD COLUMN "pdfExportStatus" TEXT,
ADD COLUMN "pdfExportKey" TEXT,
ADD COLUMN "pdfExportPendingKey" TEXT,
ADD COLUMN "pdfExportCommitSha" TEXT,
ADD COLUMN "pdfExportCapturedAt" TIMESTAMP(3),
ADD COLUMN "pdfExportAttemptedAt" TIMESTAMP(3);

CREATE INDEX "SessionGroup_kind_pdfExportStatus_idx"
ON "SessionGroup"("kind", "pdfExportStatus");
