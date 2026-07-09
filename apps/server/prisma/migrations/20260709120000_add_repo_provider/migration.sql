-- CreateEnum
CREATE TYPE "RepoProvider" AS ENUM ('github', 'managed');

-- AlterTable
ALTER TABLE "Repo" ADD COLUMN "provider" "RepoProvider" NOT NULL DEFAULT 'github';
