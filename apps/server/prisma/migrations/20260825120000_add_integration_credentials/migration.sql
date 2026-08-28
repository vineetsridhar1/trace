ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'integration_credential_created';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'integration_credential_revoked';

CREATE TABLE "IntegrationCredential" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "scopes" TEXT[],
    "allowedChannelIds" TEXT[],
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationCredential_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Session" ADD COLUMN "integrationCredentialId" TEXT;

CREATE UNIQUE INDEX "IntegrationCredential_tokenHash_key"
ON "IntegrationCredential"("tokenHash");

CREATE INDEX "IntegrationCredential_organizationId_revokedAt_idx"
ON "IntegrationCredential"("organizationId", "revokedAt");

CREATE INDEX "IntegrationCredential_createdById_idx"
ON "IntegrationCredential"("createdById");

CREATE INDEX "Session_integrationCredentialId_createdAt_idx"
ON "Session"("integrationCredentialId", "createdAt");

ALTER TABLE "IntegrationCredential"
ADD CONSTRAINT "IntegrationCredential_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IntegrationCredential"
ADD CONSTRAINT "IntegrationCredential_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Session"
ADD CONSTRAINT "Session_integrationCredentialId_fkey"
FOREIGN KEY ("integrationCredentialId") REFERENCES "IntegrationCredential"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
