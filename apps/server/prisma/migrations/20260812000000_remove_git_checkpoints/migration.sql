DELETE FROM "Event"
WHERE "eventType" = 'session_output'
  AND "payload"->>'type' IN ('git_checkpoint', 'git_checkpoint_rewrite');

UPDATE "Event"
SET "metadata" = "metadata" - 'checkpointContextId'
WHERE "metadata" ? 'checkpointContextId';

UPDATE "Event"
SET "payload" = "payload" - 'restoreCheckpointId' - 'restoreCheckpointSha'
WHERE "eventType" = 'session_started'
  AND ("payload" ? 'restoreCheckpointId' OR "payload" ? 'restoreCheckpointSha');

ALTER TABLE "AppDeployment" DROP CONSTRAINT IF EXISTS "AppDeployment_sourceCheckpointId_fkey";
ALTER TABLE "AppDeployment" DROP COLUMN IF EXISTS "sourceCheckpointId";
DROP TABLE IF EXISTS "GitCheckpoint";
