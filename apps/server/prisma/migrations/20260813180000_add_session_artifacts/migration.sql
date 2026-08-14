-- This schema may already exist on databases that applied the original
-- 20260730120000_add_artifacts migration before the OSS/internal histories
-- converged.
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'artifact_created';

ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "activeInvocationId" TEXT;

CREATE TABLE IF NOT EXISTS "Artifact" (
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

CREATE UNIQUE INDEX IF NOT EXISTS "Artifact_idempotencyKey_key" ON "Artifact"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "Artifact_organizationId_createdAt_idx" ON "Artifact"("organizationId", "createdAt");
CREATE INDEX IF NOT EXISTS "Artifact_sessionId_type_key_createdAt_idx" ON "Artifact"("sessionId", "type", "key", "createdAt");
CREATE INDEX IF NOT EXISTS "Artifact_bundleDigest_idx" ON "Artifact"("bundleDigest");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'Artifact_organizationId_fkey'
      AND conrelid = '"Artifact"'::regclass
  ) THEN
    ALTER TABLE "Artifact"
      ADD CONSTRAINT "Artifact_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'Artifact_sessionId_fkey'
      AND conrelid = '"Artifact"'::regclass
  ) THEN
    ALTER TABLE "Artifact"
      ADD CONSTRAINT "Artifact_sessionId_fkey"
      FOREIGN KEY ("sessionId") REFERENCES "Session"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'Artifact_createdById_fkey'
      AND conrelid = '"Artifact"'::regclass
  ) THEN
    ALTER TABLE "Artifact"
      ADD CONSTRAINT "Artifact_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
