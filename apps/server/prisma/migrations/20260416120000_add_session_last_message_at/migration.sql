-- AlterTable
ALTER TABLE "Session" ADD COLUMN "lastMessageAt" TIMESTAMP(3);

-- Backfill: set lastMessageAt to the greater of lastUserMessageAt and the last assistant message
UPDATE "Session" s
SET "lastMessageAt" = GREATEST(
  s."lastUserMessageAt",
  (
    SELECT MAX(e."timestamp")
    FROM "Event" e
    WHERE e."scopeType" = 'session'
      AND e."scopeId" = s."id"
      AND e."eventType" = 'session_output'
      AND e."payload"->>'type' = 'assistant'
  )
);
