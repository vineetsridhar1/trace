-- AlterTable
ALTER TABLE "GitCheckpoint" ADD COLUMN "changedFiles" TEXT[] DEFAULT ARRAY[]::TEXT[];
