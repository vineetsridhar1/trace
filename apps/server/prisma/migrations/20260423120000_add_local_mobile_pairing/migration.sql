-- CreateTable
CREATE TABLE "LocalMobilePairingToken" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocalMobilePairingToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocalMobileDevice" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "installId" TEXT NOT NULL,
    "deviceName" TEXT,
    "platform" "PushPlatform",
    "appVersion" TEXT,
    "tokenHash" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocalMobileDevice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LocalMobilePairingToken_tokenHash_key" ON "LocalMobilePairingToken"("tokenHash");

-- CreateIndex
CREATE INDEX "LocalMobilePairingToken_ownerUserId_organizationId_usedAt_expiresAt_idx" ON "LocalMobilePairingToken"("ownerUserId", "organizationId", "usedAt", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "LocalMobileDevice_tokenHash_key" ON "LocalMobileDevice"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "LocalMobileDevice_ownerUserId_organizationId_installId_key" ON "LocalMobileDevice"("ownerUserId", "organizationId", "installId");

-- CreateIndex
CREATE INDEX "LocalMobileDevice_organizationId_ownerUserId_revokedAt_lastSeenAt_idx" ON "LocalMobileDevice"("organizationId", "ownerUserId", "revokedAt", "lastSeenAt");

-- AddForeignKey
ALTER TABLE "LocalMobilePairingToken" ADD CONSTRAINT "LocalMobilePairingToken_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalMobilePairingToken" ADD CONSTRAINT "LocalMobilePairingToken_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalMobileDevice" ADD CONSTRAINT "LocalMobileDevice_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalMobileDevice" ADD CONSTRAINT "LocalMobileDevice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
