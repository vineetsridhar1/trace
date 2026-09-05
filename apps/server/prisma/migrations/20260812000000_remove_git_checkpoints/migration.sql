CREATE TABLE IF NOT EXISTS "PendingStorageObjectDeletion" (
  "key" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PendingStorageObjectDeletion_pkey" PRIMARY KEY ("key")
);

CREATE INDEX IF NOT EXISTS "PendingStorageObjectDeletion_nextAttemptAt_idx"
ON "PendingStorageObjectDeletion"("nextAttemptAt");

-- GitCheckpoint existed in multiple schema lineages. Preserve whichever object
-- keys are present before dropping the table, without requiring both columns.
DO $$
BEGIN
  IF to_regclass('"GitCheckpoint"') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'GitCheckpoint'
        AND column_name = 'captureKey'
    ) THEN
      EXECUTE '
        INSERT INTO "PendingStorageObjectDeletion" ("key")
        SELECT "captureKey" FROM "GitCheckpoint" WHERE "captureKey" IS NOT NULL
        ON CONFLICT ("key") DO NOTHING
      ';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'GitCheckpoint'
        AND column_name = 'previewKey'
    ) THEN
      EXECUTE '
        INSERT INTO "PendingStorageObjectDeletion" ("key")
        SELECT "previewKey" FROM "GitCheckpoint" WHERE "previewKey" IS NOT NULL
        ON CONFLICT ("key") DO NOTHING
      ';
    END IF;
  END IF;
END $$;

ALTER TABLE IF EXISTS "AppDeployment"
DROP CONSTRAINT IF EXISTS "AppDeployment_sourceCheckpointId_fkey";

ALTER TABLE IF EXISTS "AppDeployment"
DROP COLUMN IF EXISTS "sourceCheckpointId";
DROP TABLE IF EXISTS "GitCheckpoint";
