-- CreateEnum
CREATE TYPE "ChatType" AS ENUM ('dm', 'group');

-- AlterEnum
ALTER TYPE "ScopeType" ADD VALUE 'chat';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.
ALTER TYPE "EventType" ADD VALUE 'chat_created';
ALTER TYPE "EventType" ADD VALUE 'chat_member_added';
ALTER TYPE "EventType" ADD VALUE 'chat_member_removed';
ALTER TYPE "EventType" ADD VALUE 'chat_renamed';

-- CreateTable
CREATE TABLE "Chat" (
    "id" TEXT NOT NULL,
    "type" "ChatType" NOT NULL,
    "name" TEXT,
    "dmKey" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Chat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMember" (
    "chatId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "ChatMember_pkey" PRIMARY KEY ("chatId","userId")
);

-- CreateTable
CREATE TABLE "Participant" (
    "userId" TEXT NOT NULL,
    "scopeType" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "subscribedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mutedAt" TIMESTAMP(3),

    CONSTRAINT "Participant_pkey" PRIMARY KEY ("userId","scopeType","scopeId")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_id_organizationId_key" ON "User"("id", "organizationId");

-- CreateIndex
CREATE INDEX "Chat_organizationId_idx" ON "Chat"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Chat_id_organizationId_key" ON "Chat"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Chat_organizationId_dmKey_key" ON "Chat"("organizationId", "dmKey");

-- CreateIndex
CREATE INDEX "ChatMember_organizationId_idx" ON "ChatMember"("organizationId");

-- CreateIndex
CREATE INDEX "ChatMember_userId_idx" ON "ChatMember"("userId");

-- CreateIndex
CREATE INDEX "Participant_scopeType_scopeId_idx" ON "Participant"("scopeType", "scopeId");

-- CreateIndex
CREATE INDEX "Participant_organizationId_userId_idx" ON "Participant"("organizationId", "userId");

-- AddForeignKey
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_createdById_organizationId_fkey" FOREIGN KEY ("createdById", "organizationId") REFERENCES "User"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMember" ADD CONSTRAINT "ChatMember_chatId_organizationId_fkey" FOREIGN KEY ("chatId", "organizationId") REFERENCES "Chat"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMember" ADD CONSTRAINT "ChatMember_userId_organizationId_fkey" FOREIGN KEY ("userId", "organizationId") REFERENCES "User"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_userId_organizationId_fkey" FOREIGN KEY ("userId", "organizationId") REFERENCES "User"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateFunction
CREATE OR REPLACE FUNCTION "validate_participant_scope_organization"()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW."scopeType" = 'chat' THEN
        IF NOT EXISTS (
            SELECT 1 FROM "Chat"
            WHERE "id" = NEW."scopeId"
              AND "organizationId" = NEW."organizationId"
        ) THEN
            RAISE EXCEPTION 'Participant chat scope does not belong to organization';
        END IF;
    ELSIF NEW."scopeType" = 'channel' THEN
        IF NOT EXISTS (
            SELECT 1 FROM "Channel"
            WHERE "id" = NEW."scopeId"
              AND "organizationId" = NEW."organizationId"
        ) THEN
            RAISE EXCEPTION 'Participant channel scope does not belong to organization';
        END IF;
    ELSIF NEW."scopeType" = 'session' THEN
        IF NOT EXISTS (
            SELECT 1 FROM "Session"
            WHERE "id" = NEW."scopeId"
              AND "organizationId" = NEW."organizationId"
        ) THEN
            RAISE EXCEPTION 'Participant session scope does not belong to organization';
        END IF;
    ELSIF NEW."scopeType" = 'ticket' THEN
        IF NOT EXISTS (
            SELECT 1 FROM "Ticket"
            WHERE "id" = NEW."scopeId"
              AND "organizationId" = NEW."organizationId"
        ) THEN
            RAISE EXCEPTION 'Participant ticket scope does not belong to organization';
        END IF;
    ELSIF NEW."scopeType" = 'thread' THEN
        IF NOT EXISTS (
            SELECT 1 FROM "Event"
            WHERE "id" = NEW."scopeId"
              AND "organizationId" = NEW."organizationId"
              AND "parentId" IS NULL
        ) THEN
            RAISE EXCEPTION 'Participant thread scope does not belong to organization';
        END IF;
    ELSE
        RAISE EXCEPTION 'Unsupported participant scope type: %', NEW."scopeType";
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- CreateTrigger
CREATE TRIGGER "Participant_validate_scope_organization"
BEFORE INSERT OR UPDATE OF "scopeType", "scopeId", "organizationId"
ON "Participant"
FOR EACH ROW
EXECUTE FUNCTION "validate_participant_scope_organization"();
