CREATE TYPE "RepoProvider" AS ENUM ('github', 'managed');

ALTER TABLE "Repo"
ADD COLUMN "provider" "RepoProvider" NOT NULL DEFAULT 'github';

CREATE INDEX "Repo_organizationId_provider_idx" ON "Repo"("organizationId", "provider");
