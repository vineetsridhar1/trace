-- AlterEnum
ALTER TYPE "EventType" ADD VALUE 'repo_created';

-- AlterTable
ALTER TABLE "Session" ALTER COLUMN "status" SET DEFAULT 'pending';
