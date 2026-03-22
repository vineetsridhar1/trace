-- CreateTable
CREATE TABLE "ChannelGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isCollapsed" BOOLEAN NOT NULL DEFAULT false,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelGroup_pkey" PRIMARY KEY ("id")
);

-- AddColumns to Channel
ALTER TABLE "Channel" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Channel" ADD COLUMN "groupId" TEXT;

-- CreateIndex
CREATE INDEX "ChannelGroup_organizationId_position_idx" ON "ChannelGroup"("organizationId", "position");
CREATE INDEX "Channel_organizationId_position_idx" ON "Channel"("organizationId", "position");

-- AddForeignKey
ALTER TABLE "ChannelGroup" ADD CONSTRAINT "ChannelGroup_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ChannelGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add new event types
ALTER TYPE "EventType" ADD VALUE 'channel_updated';
ALTER TYPE "EventType" ADD VALUE 'channel_group_created';
ALTER TYPE "EventType" ADD VALUE 'channel_group_updated';
ALTER TYPE "EventType" ADD VALUE 'channel_group_deleted';
