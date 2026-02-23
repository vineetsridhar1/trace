-- Add creation_script column to channels
ALTER TABLE "channels" ADD COLUMN "creation_script" TEXT;

-- Migrate existing creation scripts: concatenate commands per channel
UPDATE "channels" c
SET "creation_script" = sub.commands
FROM (
  SELECT "channel_id", string_agg("command", E'\n' ORDER BY "sort_order") AS commands
  FROM "startup_scripts"
  WHERE "script_type" = 'creation'
  GROUP BY "channel_id"
) sub
WHERE c."id" = sub."channel_id";

-- Delete creation-type rows from startup_scripts
DELETE FROM "startup_scripts" WHERE "script_type" = 'creation';
