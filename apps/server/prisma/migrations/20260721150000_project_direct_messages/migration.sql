ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'chat_read';

ALTER TABLE "Chat"
  ADD COLUMN "organizationId" TEXT,
  ADD COLUMN "lastMessageId" TEXT,
  ADD COLUMN "lastMessageAt" TIMESTAMP(3);

ALTER TABLE "Message"
  ADD COLUMN "clientMutationId" TEXT;

ALTER TABLE "ChatMember"
  ADD COLUMN "lastReadMessageId" TEXT,
  ADD COLUMN "lastReadAt" TIMESTAMP(3),
  ADD COLUMN "unreadCount" INTEGER NOT NULL DEFAULT 0;

-- Event rows are the authoritative source for the organization that created a
-- legacy chat. Only unambiguous histories are accepted.
WITH "EventOrganizations" AS (
  SELECT "scopeId" AS "chatId", MIN("organizationId") AS "organizationId"
  FROM "Event"
  WHERE "scopeType" = 'chat'
  GROUP BY "scopeId"
  HAVING COUNT(DISTINCT "organizationId") = 1
)
UPDATE "Chat" AS c
SET "organizationId" = eo."organizationId"
FROM "EventOrganizations" AS eo
WHERE eo."chatId" = c."id";

-- Empty legacy chats may have no events. Fall back only when every member is
-- active in exactly one common organization.
WITH "MembershipCandidates" AS (
  SELECT c."id" AS "chatId", o."id" AS "organizationId"
  FROM "Chat" AS c
  CROSS JOIN "Organization" AS o
  WHERE c."organizationId" IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM "ChatMember" AS cm
      WHERE cm."chatId" = c."id"
        AND cm."leftAt" IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM "OrgMember" AS om
          WHERE om."userId" = cm."userId"
            AND om."organizationId" = o."id"
        )
    )
),
"UniqueMembershipOrganizations" AS (
  SELECT "chatId", MIN("organizationId") AS "organizationId"
  FROM "MembershipCandidates"
  GROUP BY "chatId"
  HAVING COUNT(*) = 1
)
UPDATE "Chat" AS c
SET "organizationId" = u."organizationId"
FROM "UniqueMembershipOrganizations" AS u
WHERE u."chatId" = c."id";

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Chat" WHERE "organizationId" IS NULL) THEN
    RAISE EXCEPTION 'Cannot safely infer organization ownership for one or more legacy chats';
  END IF;
END $$;

WITH "LatestMessages" AS (
  SELECT DISTINCT ON (m."chatId")
    m."chatId",
    m."id" AS "messageId",
    m."createdAt"
  FROM "Message" AS m
  WHERE m."chatId" IS NOT NULL
  ORDER BY m."chatId", m."createdAt" DESC, m."id" DESC
)
UPDATE "Chat" AS c
SET
  "lastMessageId" = lm."messageId",
  "lastMessageAt" = lm."createdAt"
FROM "LatestMessages" AS lm
WHERE lm."chatId" = c."id";

-- Do not surface every legacy message as unread immediately after deployment.
UPDATE "ChatMember" AS cm
SET
  "lastReadMessageId" = c."lastMessageId",
  "lastReadAt" = c."lastMessageAt",
  "unreadCount" = 0
FROM "Chat" AS c
WHERE c."id" = cm."chatId";

ALTER TABLE "Chat" ALTER COLUMN "organizationId" SET NOT NULL;

DROP INDEX IF EXISTS "Chat_dmKey_key";
DROP INDEX IF EXISTS "ChatMember_userId_idx";
DROP INDEX IF EXISTS "Message_chatId_createdAt_idx";

CREATE UNIQUE INDEX "Chat_organizationId_dmKey_key"
  ON "Chat"("organizationId", "dmKey");
CREATE INDEX "Chat_organizationId_lastMessageAt_idx"
  ON "Chat"("organizationId", "lastMessageAt" DESC);
CREATE INDEX "ChatMember_userId_leftAt_chatId_idx"
  ON "ChatMember"("userId", "leftAt", "chatId");
CREATE UNIQUE INDEX "Message_actorType_actorId_clientMutationId_key"
  ON "Message"("actorType", "actorId", "clientMutationId");
CREATE INDEX "Message_chatId_createdAt_id_idx"
  ON "Message"("chatId", "createdAt", "id");

ALTER TABLE "Chat"
  ADD CONSTRAINT "Chat_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Chat"
  ADD CONSTRAINT "Chat_lastMessageId_fkey"
  FOREIGN KEY ("lastMessageId") REFERENCES "Message"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
