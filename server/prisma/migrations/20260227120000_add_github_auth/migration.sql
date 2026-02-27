-- AlterTable: make password_hash optional for OAuth users
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;

-- AlterTable: add github_id and github_access_token for GitHub OAuth
ALTER TABLE "users" ADD COLUMN "github_id" TEXT;
ALTER TABLE "users" ADD COLUMN "github_access_token" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_github_id_key" ON "users"("github_id");
