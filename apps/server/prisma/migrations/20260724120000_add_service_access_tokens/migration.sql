ALTER TYPE "EventType" ADD VALUE 'service_access_token_created';
ALTER TYPE "EventType" ADD VALUE 'service_access_token_revoked';

CREATE TABLE "ServiceAccessToken" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "createdById" TEXT,
  "name" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "tokenPrefix" TEXT NOT NULL,
  "scopes" TEXT[],
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "lastUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServiceAccessToken_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Session"
  ADD COLUMN "serviceAccessTokenId" TEXT,
  ADD COLUMN "serviceIdempotencyKey" TEXT;

CREATE UNIQUE INDEX "ServiceAccessToken_tokenHash_key" ON "ServiceAccessToken"("tokenHash");
CREATE INDEX "ServiceAccessToken_organizationId_revokedAt_createdAt_idx"
  ON "ServiceAccessToken"("organizationId", "revokedAt", "createdAt");
CREATE INDEX "ServiceAccessToken_createdById_idx" ON "ServiceAccessToken"("createdById");
CREATE UNIQUE INDEX "Session_serviceAccessTokenId_serviceIdempotencyKey_key"
  ON "Session"("serviceAccessTokenId", "serviceIdempotencyKey");

ALTER TABLE "ServiceAccessToken"
  ADD CONSTRAINT "ServiceAccessToken_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceAccessToken"
  ADD CONSTRAINT "ServiceAccessToken_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Session"
  ADD CONSTRAINT "Session_serviceAccessTokenId_fkey"
  FOREIGN KEY ("serviceAccessTokenId") REFERENCES "ServiceAccessToken"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
