ALTER TABLE "DesignSystem"
ADD COLUMN "repairAttempts" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "DesignSystemCommitArtifact"
DROP COLUMN "repairAttempts",
ADD COLUMN "repairRequestedAt" TIMESTAMP(3);
