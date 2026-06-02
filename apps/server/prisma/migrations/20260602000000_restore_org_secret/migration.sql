CREATE TABLE IF NOT EXISTS "OrgSecret" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "encryptedValue" TEXT NOT NULL,
  "iv" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrgSecret_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OrgSecret_organizationId_name_key"
  ON "OrgSecret"("organizationId", "name");

CREATE INDEX IF NOT EXISTS "OrgSecret_organizationId_idx"
  ON "OrgSecret"("organizationId");

ALTER TABLE "OrgSecret"
  DROP CONSTRAINT IF EXISTS "OrgSecret_organizationId_fkey";

ALTER TABLE "OrgSecret"
  ADD CONSTRAINT "OrgSecret_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
