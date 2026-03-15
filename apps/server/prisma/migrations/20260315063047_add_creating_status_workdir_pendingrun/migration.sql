-- AlterEnum
ALTER TYPE "SessionStatus" ADD VALUE 'creating';

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "pendingRun" JSONB,
ADD COLUMN     "workdir" TEXT;
