ALTER TABLE "MobileDevice" RENAME COLUMN "organizationId" TO "pairedOrganizationId";

ALTER TABLE "MobileDevice" DROP CONSTRAINT "MobileDevice_organizationId_fkey";
ALTER INDEX "MobileDevice_ownerUserId_organizationId_installId_key" RENAME TO "MobileDevice_ownerUserId_installId_key_old";
DROP INDEX "MobileDevice_ownerUserId_installId_key_old";
DROP INDEX "MobileDevice_organizationId_ownerUserId_revokedAt_lastSeenAt_idx";

WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "ownerUserId", "installId"
      ORDER BY
        ("revokedAt" IS NULL) DESC,
        COALESCE("lastSeenAt", "createdAt") DESC,
        "createdAt" DESC,
        "id" ASC
    ) AS row_rank
  FROM "MobileDevice"
)
DELETE FROM "MobileDevice"
WHERE "id" IN (SELECT "id" FROM ranked WHERE row_rank > 1);

ALTER TABLE "MobileDevice" ALTER COLUMN "pairedOrganizationId" DROP NOT NULL;

ALTER TABLE "MobileDevice"
  ADD CONSTRAINT "MobileDevice_pairedOrganizationId_fkey"
  FOREIGN KEY ("pairedOrganizationId") REFERENCES "Organization"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "MobileDevice_ownerUserId_installId_key" ON "MobileDevice"("ownerUserId", "installId");
CREATE INDEX "MobileDevice_ownerUserId_revokedAt_lastSeenAt_idx" ON "MobileDevice"("ownerUserId", "revokedAt", "lastSeenAt");
