-- AlterTable
ALTER TABLE "SessionGroup" ADD COLUMN "archivedAt" TIMESTAMP(3);

-- AlterEnum
ALTER TYPE "EventType" ADD VALUE 'session_group_archived';
