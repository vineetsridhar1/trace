-- AlterEnum
ALTER TYPE "SessionStatus" ADD VALUE 'in_review';
ALTER TYPE "SessionStatus" ADD VALUE 'merged';

-- AlterEnum
ALTER TYPE "EventType" ADD VALUE 'session_pr_opened';
ALTER TYPE "EventType" ADD VALUE 'session_pr_merged';

-- AlterTable
ALTER TABLE "Session" ADD COLUMN "prUrl" TEXT;

-- AlterTable
ALTER TABLE "Repo" ADD COLUMN "webhookId" TEXT;
ALTER TABLE "Repo" ADD COLUMN "webhookSecret" TEXT;
