CREATE TYPE "ClientDeviceType" AS ENUM ('mobile', 'cli');

ALTER TABLE "MobileDevice"
ADD COLUMN "clientType" "ClientDeviceType" NOT NULL DEFAULT 'mobile';

CREATE INDEX "MobileDevice_ownerUserId_clientType_revokedAt_lastSeenAt_idx"
ON "MobileDevice"("ownerUserId", "clientType", "revokedAt", "lastSeenAt");
