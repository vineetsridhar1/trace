-- CreateTable
CREATE TABLE "SessionGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "channelId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionGroup_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "sessionGroupId" TEXT;

-- DropForeignKey
ALTER TABLE "Session" DROP CONSTRAINT "Session_parentSessionId_fkey";

-- AlterTable
ALTER TABLE "Session" DROP COLUMN "parentSessionId";

-- CreateIndex
CREATE INDEX "SessionGroup_organizationId_updatedAt_idx" ON "SessionGroup"("organizationId", "updatedAt");

-- CreateIndex
CREATE INDEX "SessionGroup_channelId_updatedAt_idx" ON "SessionGroup"("channelId", "updatedAt");

-- CreateIndex
CREATE INDEX "Session_sessionGroupId_updatedAt_idx" ON "Session"("sessionGroupId", "updatedAt");

-- AddForeignKey
ALTER TABLE "SessionGroup" ADD CONSTRAINT "SessionGroup_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionGroup" ADD CONSTRAINT "SessionGroup_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_sessionGroupId_fkey" FOREIGN KEY ("sessionGroupId") REFERENCES "SessionGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
