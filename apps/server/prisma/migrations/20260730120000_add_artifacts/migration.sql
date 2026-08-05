-- Artifacts are immutable, typed bundles produced inside a session.
ALTER TYPE "EventType" ADD VALUE 'artifact_created';
ALTER TYPE "EventType" ADD VALUE 'artifact_approved';

ALTER TABLE "Session" ADD COLUMN "activeInvocationId" TEXT;

CREATE TABLE "Artifact" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "bundleDigest" TEXT NOT NULL,
    "manifest" JSONB NOT NULL,
    "storageKey" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "createdById" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Artifact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Artifact_idempotencyKey_key" ON "Artifact"("idempotencyKey");
CREATE INDEX "Artifact_organizationId_createdAt_idx" ON "Artifact"("organizationId", "createdAt");
CREATE INDEX "Artifact_sessionId_type_key_createdAt_idx" ON "Artifact"("sessionId", "type", "key", "createdAt");
CREATE INDEX "Artifact_bundleDigest_idx" ON "Artifact"("bundleDigest");

ALTER TABLE "Artifact"
  ADD CONSTRAINT "Artifact_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Artifact"
  ADD CONSTRAINT "Artifact_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "Session"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Artifact"
  ADD CONSTRAINT "Artifact_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
