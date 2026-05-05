-- CreateTable
CREATE TABLE "MobilePairingToken" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MobilePairingToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MobileDevice" (
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

    CONSTRAINT "MobileDevice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MobilePairingToken_tokenHash_key" ON "MobilePairingToken"("tokenHash");

-- CreateIndex
CREATE INDEX "MobilePairingToken_ownerUserId_organizationId_usedAt_expiresAt_idx" ON "MobilePairingToken"("ownerUserId", "organizationId", "usedAt", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "MobileDevice_tokenHash_key" ON "MobileDevice"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "MobileDevice_ownerUserId_organizationId_installId_key" ON "MobileDevice"("ownerUserId", "organizationId", "installId");

-- CreateIndex
CREATE INDEX "MobileDevice_organizationId_ownerUserId_revokedAt_lastSeenAt_idx" ON "MobileDevice"("organizationId", "ownerUserId", "revokedAt", "lastSeenAt");

-- AddForeignKey
ALTER TABLE "MobilePairingToken" ADD CONSTRAINT "MobilePairingToken_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MobilePairingToken" ADD CONSTRAINT "MobilePairingToken_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MobileDevice" ADD CONSTRAINT "MobileDevice_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MobileDevice" ADD CONSTRAINT "MobileDevice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
