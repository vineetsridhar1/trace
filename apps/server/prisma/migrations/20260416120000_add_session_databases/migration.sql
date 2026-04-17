-- AlterTable
ALTER TABLE "SessionGroup" ADD COLUMN "database" JSONB;

-- AlterTable
ALTER TABLE "Session" ADD COLUMN "database" JSONB;
