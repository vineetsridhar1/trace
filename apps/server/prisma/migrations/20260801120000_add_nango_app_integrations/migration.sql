CREATE TYPE "IntegrationConnectionKind" AS ENUM ('personal', 'service');
CREATE TYPE "IntegrationConnectionStatus" AS ENUM ('active', 'error', 'revoked');
CREATE TYPE "IntegrationExecutionIdentity" AS ENUM ('viewer', 'shared', 'service');

ALTER TYPE "EventType" ADD VALUE 'integration_connection_created';
ALTER TYPE "EventType" ADD VALUE 'integration_connection_updated';
ALTER TYPE "EventType" ADD VALUE 'integration_connection_deleted';
ALTER TYPE "EventType" ADD VALUE 'app_integration_binding_updated';
ALTER TYPE "EventType" ADD VALUE 'app_integration_request_executed';

CREATE TABLE "IntegrationConnection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerConfigKey" TEXT NOT NULL,
    "nangoConnectionId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "kind" "IntegrationConnectionKind" NOT NULL DEFAULT 'personal',
    "status" "IntegrationConnectionStatus" NOT NULL DEFAULT 'active',
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IntegrationConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AppIntegrationBinding" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sessionGroupId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerConfigKey" TEXT NOT NULL,
    "executionIdentity" "IntegrationExecutionIdentity" NOT NULL,
    "sharedConnectionId" TEXT,
    "allowedMethods" TEXT[] NOT NULL DEFAULT ARRAY['GET']::TEXT[],
    "allowedPathPrefixes" TEXT[] NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AppIntegrationBinding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IntegrationConnection_providerConfigKey_nangoConnectionId_key" ON "IntegrationConnection"("providerConfigKey", "nangoConnectionId");
CREATE INDEX "IntegrationConnection_organizationId_providerConfigKey_idx" ON "IntegrationConnection"("organizationId", "providerConfigKey");
CREATE INDEX "IntegrationConnection_ownerUserId_providerConfigKey_idx" ON "IntegrationConnection"("ownerUserId", "providerConfigKey");
CREATE INDEX "AppIntegrationBinding_organizationId_sessionGroupId_idx" ON "AppIntegrationBinding"("organizationId", "sessionGroupId");
CREATE INDEX "AppIntegrationBinding_sharedConnectionId_idx" ON "AppIntegrationBinding"("sharedConnectionId");

ALTER TABLE "IntegrationConnection" ADD CONSTRAINT "IntegrationConnection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntegrationConnection" ADD CONSTRAINT "IntegrationConnection_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntegrationConnection" ADD CONSTRAINT "IntegrationConnection_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AppIntegrationBinding" ADD CONSTRAINT "AppIntegrationBinding_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AppIntegrationBinding" ADD CONSTRAINT "AppIntegrationBinding_sessionGroupId_fkey" FOREIGN KEY ("sessionGroupId") REFERENCES "SessionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AppIntegrationBinding" ADD CONSTRAINT "AppIntegrationBinding_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AppIntegrationBinding" ADD CONSTRAINT "AppIntegrationBinding_sharedConnectionId_fkey" FOREIGN KEY ("sharedConnectionId") REFERENCES "IntegrationConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
