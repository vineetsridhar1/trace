-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EventType" ADD VALUE 'mcp_server_created';
ALTER TYPE "EventType" ADD VALUE 'mcp_server_updated';
ALTER TYPE "EventType" ADD VALUE 'mcp_server_deleted';
ALTER TYPE "EventType" ADD VALUE 'mcp_connection_created';
ALTER TYPE "EventType" ADD VALUE 'mcp_connection_deleted';

-- CreateTable
CREATE TABLE "McpServer" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "transport" TEXT NOT NULL DEFAULT 'http',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "oauthMetadata" JSONB,
    "clientId" TEXT,
    "encryptedClientSecret" TEXT,
    "clientSecretIv" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "McpServer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McpConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mcpServerId" TEXT NOT NULL,
    "encryptedAccessToken" TEXT NOT NULL,
    "accessIv" TEXT NOT NULL,
    "encryptedRefreshToken" TEXT,
    "refreshIv" TEXT,
    "expiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "McpConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "McpServer_organizationId_idx" ON "McpServer"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "McpServer_organizationId_name_key" ON "McpServer"("organizationId", "name");

-- CreateIndex
CREATE INDEX "McpConnection_userId_idx" ON "McpConnection"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "McpConnection_userId_mcpServerId_key" ON "McpConnection"("userId", "mcpServerId");

-- AddForeignKey
ALTER TABLE "McpServer" ADD CONSTRAINT "McpServer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpConnection" ADD CONSTRAINT "McpConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpConnection" ADD CONSTRAINT "McpConnection_mcpServerId_fkey" FOREIGN KEY ("mcpServerId") REFERENCES "McpServer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
