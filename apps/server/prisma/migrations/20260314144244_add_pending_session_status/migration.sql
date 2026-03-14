-- AlterEnum
ALTER TYPE "SessionStatus" ADD VALUE IF NOT EXISTS 'pending';
COMMIT;
BEGIN;

-- AlterTable
ALTER TABLE "Session" ALTER COLUMN "status" SET DEFAULT 'pending';
