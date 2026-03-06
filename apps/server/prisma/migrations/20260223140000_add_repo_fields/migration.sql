-- AlterTable: rename cwd to local_repo_path and add new fields
ALTER TABLE "channels" RENAME COLUMN "cwd" TO "local_repo_path";
ALTER TABLE "channels" ADD COLUMN "base_branch" TEXT;
ALTER TABLE "channels" ADD COLUMN "github_url" TEXT;
