-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "actorId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "html" TEXT,
    "mentions" JSONB,
    "parentMessageId" TEXT,
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- Backfill chat messages from immutable event history so existing dev data survives.
INSERT INTO "Message" (
    "id",
    "chatId",
    "organizationId",
    "actorType",
    "actorId",
    "text",
    "html",
    "mentions",
    "parentMessageId",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "scopeId",
    "organizationId",
    "actorType",
    "actorId",
    COALESCE("payload"->>'text', ''),
    NULLIF("payload"->>'html', ''),
    CASE
        WHEN jsonb_typeof("payload"->'mentions') = 'array' THEN "payload"->'mentions'
        ELSE NULL
    END,
    "parentId",
    "timestamp",
    "timestamp"
FROM "Event"
WHERE "scopeType" = 'chat'
  AND "eventType" = 'message_sent';

-- CreateIndex
CREATE INDEX "Message_organizationId_idx" ON "Message"("organizationId");

-- CreateIndex
CREATE INDEX "Message_chatId_createdAt_idx" ON "Message"("chatId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_parentMessageId_createdAt_idx" ON "Message"("parentMessageId", "createdAt");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_chatId_organizationId_fkey"
FOREIGN KEY ("chatId", "organizationId") REFERENCES "Chat"("id", "organizationId")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_parentMessageId_fkey"
FOREIGN KEY ("parentMessageId") REFERENCES "Message"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
