-- AlterTable
ALTER TABLE "Channel" ADD COLUMN "setupScript" TEXT,
ADD COLUMN "runScripts" JSONB DEFAULT '[]';
