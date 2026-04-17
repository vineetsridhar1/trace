-- AlterTable
ALTER TABLE "Session" ADD COLUMN "lastMessageAt" TIMESTAMP(3);

-- Backfill: set lastMessageAt to the greater of lastUserMessageAt and the last assistant event
UPDATE "Session" s
SET "lastMessageAt" = GREATEST(s."lastUserMessageAt", sub."lastAssistantAt")
FROM (
  SELECT e."scopeId", MAX(e."timestamp") AS "lastAssistantAt"
  FROM "Event" e
  WHERE e."scopeType" = 'session'
    AND e."eventType" = 'session_output'
    AND e."payload"->>'type' = 'assistant'
  GROUP BY e."scopeId"
) sub
WHERE sub."scopeId" = s."id";

-- Backfill sessions with no assistant messages but with lastUserMessageAt
UPDATE "Session"
SET "lastMessageAt" = "lastUserMessageAt"
WHERE "lastMessageAt" IS NULL
  AND "lastUserMessageAt" IS NOT NULL;
