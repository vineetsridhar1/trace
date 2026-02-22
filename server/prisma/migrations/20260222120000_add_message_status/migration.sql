-- AlterTable
ALTER TABLE "messages" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'pending';

-- Backfill: messages that have events beyond UserPromptSubmit get 'in_progress'
UPDATE "messages" SET "status" = 'in_progress'
WHERE "id" IN (
  SELECT DISTINCT m."id" FROM "messages" m
  JOIN "threads" t ON t."message_id" = m."id"
  JOIN "events" e ON e."thread_id" = t."id"
  WHERE e."hook_event_name" != 'UserPromptSubmit'
) AND "status" = 'pending';
