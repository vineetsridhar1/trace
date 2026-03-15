-- CreateIndex
CREATE UNIQUE INDEX "Repo_organizationId_remoteUrl_key" ON "Repo"("organizationId", "remoteUrl");
