-- AlterTable
ALTER TABLE "QueuedMessage" ADD COLUMN "imageKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
