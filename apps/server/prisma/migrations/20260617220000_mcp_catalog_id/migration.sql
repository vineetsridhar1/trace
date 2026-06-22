-- Replace free-form server identity with a curated catalog id.
ALTER TABLE "McpServer" ADD COLUMN "catalogId" TEXT NOT NULL;

DROP INDEX "McpServer_organizationId_name_key";

CREATE UNIQUE INDEX "McpServer_organizationId_catalogId_key" ON "McpServer"("organizationId", "catalogId");
