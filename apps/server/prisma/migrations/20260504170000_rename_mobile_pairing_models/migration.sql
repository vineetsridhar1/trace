ALTER TABLE "LocalMobilePairingToken" RENAME TO "MobilePairingToken";
ALTER TABLE "LocalMobileDevice" RENAME TO "MobileDevice";

ALTER TABLE "MobilePairingToken" RENAME CONSTRAINT "LocalMobilePairingToken_pkey" TO "MobilePairingToken_pkey";
ALTER TABLE "MobilePairingToken" RENAME CONSTRAINT "LocalMobilePairingToken_ownerUserId_fkey" TO "MobilePairingToken_ownerUserId_fkey";
ALTER TABLE "MobilePairingToken" RENAME CONSTRAINT "LocalMobilePairingToken_organizationId_fkey" TO "MobilePairingToken_organizationId_fkey";
ALTER INDEX "LocalMobilePairingToken_tokenHash_key" RENAME TO "MobilePairingToken_tokenHash_key";
ALTER INDEX "LocalMobilePairingToken_ownerUserId_organizationId_usedAt_expiresAt_idx" RENAME TO "MobilePairingToken_ownerUserId_organizationId_usedAt_expiresAt_idx";

ALTER TABLE "MobileDevice" RENAME CONSTRAINT "LocalMobileDevice_pkey" TO "MobileDevice_pkey";
ALTER TABLE "MobileDevice" RENAME CONSTRAINT "LocalMobileDevice_ownerUserId_fkey" TO "MobileDevice_ownerUserId_fkey";
ALTER TABLE "MobileDevice" RENAME CONSTRAINT "LocalMobileDevice_organizationId_fkey" TO "MobileDevice_organizationId_fkey";
ALTER INDEX "LocalMobileDevice_tokenHash_key" RENAME TO "MobileDevice_tokenHash_key";
ALTER INDEX "LocalMobileDevice_ownerUserId_organizationId_installId_key" RENAME TO "MobileDevice_ownerUserId_organizationId_installId_key";
ALTER INDEX "LocalMobileDevice_organizationId_ownerUserId_revokedAt_lastSeenAt_idx" RENAME TO "MobileDevice_organizationId_ownerUserId_revokedAt_lastSeenAt_idx";
