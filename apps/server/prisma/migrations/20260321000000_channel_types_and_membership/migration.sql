-- Add new ChannelType values
ALTER TYPE "ChannelType" ADD VALUE IF NOT EXISTS 'coding';
ALTER TYPE "ChannelType" ADD VALUE IF NOT EXISTS 'text';

-- Add new EventType values
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'channel_member_added';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'channel_member_removed';

-- Migrate existing channels from 'default' to 'coding'
-- We need to use a workaround since PostgreSQL doesn't support renaming enum values directly
-- Instead, we'll update the column using a text cast
ALTER TABLE "Channel" ALTER COLUMN "type" TYPE TEXT;
UPDATE "Channel" SET "type" = 'coding' WHERE "type" IN ('default', 'announcement', 'triage', 'feed');
-- Set any remaining to 'coding' as fallback
UPDATE "Channel" SET "type" = 'coding' WHERE "type" NOT IN ('coding', 'text');
ALTER TABLE "Channel" ALTER COLUMN "type" TYPE "ChannelType" USING "type"::"ChannelType";

-- Update default
ALTER TABLE "Channel" ALTER COLUMN "type" SET DEFAULT 'coding';

-- Add compound unique on Channel for ChannelMember FK
CREATE UNIQUE INDEX "Channel_id_organizationId_key" ON "Channel"("id", "organizationId");

-- CreateTable
CREATE TABLE "ChannelMember" (
    "channelId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "ChannelMember_pkey" PRIMARY KEY ("channelId","userId")
);

-- CreateIndex
CREATE INDEX "ChannelMember_organizationId_idx" ON "ChannelMember"("organizationId");

-- CreateIndex
CREATE INDEX "ChannelMember_userId_idx" ON "ChannelMember"("userId");

-- AddForeignKey
ALTER TABLE "ChannelMember" ADD CONSTRAINT "ChannelMember_channelId_organizationId_fkey" FOREIGN KEY ("channelId", "organizationId") REFERENCES "Channel"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelMember" ADD CONSTRAINT "ChannelMember_userId_organizationId_fkey" FOREIGN KEY ("userId", "organizationId") REFERENCES "User"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- Drop old enum values by recreating the enum
-- PostgreSQL doesn't support DROP VALUE, so we need to recreate
-- The values 'default', 'announcement', 'triage', 'feed' are now unused
-- They will remain in the enum but won't be used by any rows
