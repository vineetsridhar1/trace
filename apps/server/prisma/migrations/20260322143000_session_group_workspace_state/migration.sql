-- AlterTable
ALTER TABLE "SessionGroup"
ADD COLUMN     "connection" JSONB,
ADD COLUMN     "prUrl" TEXT,
ADD COLUMN     "workdir" TEXT,
ADD COLUMN     "worktreeDeleted" BOOLEAN NOT NULL DEFAULT false;
