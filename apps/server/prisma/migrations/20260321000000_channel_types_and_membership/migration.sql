-- Add new ChannelType values
ALTER TYPE "ChannelType" ADD VALUE IF NOT EXISTS 'coding';
ALTER TYPE "ChannelType" ADD VALUE IF NOT EXISTS 'text';

-- Add new EventType values
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'channel_member_added';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'channel_member_removed';

-- Migrate existing channels from 'default' to 'coding'
ALTER TABLE "Channel" ALTER COLUMN "type" TYPE TEXT;
UPDATE "Channel" SET "type" = 'coding' WHERE "type" IN ('default', 'announcement', 'triage', 'feed');
UPDATE "Channel" SET "type" = 'coding' WHERE "type" NOT IN ('coding', 'text');
ALTER TABLE "Channel" ALTER COLUMN "type" TYPE "ChannelType" USING "type"::"ChannelType";

-- Update default
ALTER TABLE "Channel" ALTER COLUMN "type" SET DEFAULT 'coding';

-- CreateTable
CREATE TABLE "ChannelMember" (
    "channelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "ChannelMember_pkey" PRIMARY KEY ("channelId","userId")
);

-- CreateIndex
CREATE INDEX "ChannelMember_userId_idx" ON "ChannelMember"("userId");

-- AddForeignKey
ALTER TABLE "ChannelMember" ADD CONSTRAINT "ChannelMember_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelMember" ADD CONSTRAINT "ChannelMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
