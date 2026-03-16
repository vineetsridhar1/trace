-- CreateEnum
CREATE TYPE "InboxItemType" AS ENUM ('plan', 'question');

-- CreateEnum
CREATE TYPE "InboxItemStatus" AS ENUM ('active', 'resolved', 'dismissed');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EventType" ADD VALUE 'inbox_item_created';
ALTER TYPE "EventType" ADD VALUE 'inbox_item_resolved';

-- CreateTable
CREATE TABLE "InboxItem" (
    "id" TEXT NOT NULL,
    "itemType" "InboxItemType" NOT NULL,
    "status" "InboxItemStatus" NOT NULL DEFAULT 'active',
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InboxItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InboxItem_userId_status_idx" ON "InboxItem"("userId", "status");

-- CreateIndex
CREATE INDEX "InboxItem_organizationId_userId_idx" ON "InboxItem"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "InboxItem_sourceType_sourceId_idx" ON "InboxItem"("sourceType", "sourceId");

-- AddForeignKey
ALTER TABLE "InboxItem" ADD CONSTRAINT "InboxItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
