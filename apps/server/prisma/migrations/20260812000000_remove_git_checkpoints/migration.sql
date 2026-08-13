CREATE TABLE "PendingStorageObjectDeletion" (
  "key" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PendingStorageObjectDeletion_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "PendingStorageObjectDeletion_nextAttemptAt_idx"
ON "PendingStorageObjectDeletion"("nextAttemptAt");

INSERT INTO "PendingStorageObjectDeletion" ("key")
SELECT "key"
FROM (
  SELECT "captureKey" AS "key" FROM "GitCheckpoint" WHERE "captureKey" IS NOT NULL
  UNION
  SELECT "previewKey" AS "key" FROM "GitCheckpoint" WHERE "previewKey" IS NOT NULL
) AS "checkpointObjects"
ON CONFLICT ("key") DO NOTHING;

ALTER TABLE "AppDeployment" DROP CONSTRAINT IF EXISTS "AppDeployment_sourceCheckpointId_fkey";
ALTER TABLE "AppDeployment" DROP COLUMN IF EXISTS "sourceCheckpointId";
DROP TABLE IF EXISTS "GitCheckpoint";
