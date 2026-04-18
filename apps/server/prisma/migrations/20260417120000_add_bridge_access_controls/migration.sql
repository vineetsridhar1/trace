-- CreateEnum
CREATE TYPE "BridgeAccessScopeType" AS ENUM ('all_sessions', 'session_group');

-- CreateEnum
CREATE TYPE "BridgeAccessRequestStatus" AS ENUM ('pending', 'approved', 'denied');

-- CreateTable
CREATE TABLE "BridgeRuntime" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "hostingMode" "HostingMode" NOT NULL,
    "lastSeenAt" TIMESTAMP(3),
    "connectedAt" TIMESTAMP(3),
    "disconnectedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BridgeRuntime_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BridgeAccessGrant" (
    "id" TEXT NOT NULL,
    "bridgeRuntimeId" TEXT NOT NULL,
    "granteeUserId" TEXT NOT NULL,
    "grantedByUserId" TEXT NOT NULL,
    "scopeType" "BridgeAccessScopeType" NOT NULL,
    "sessionGroupId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BridgeAccessGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BridgeAccessRequest" (
    "id" TEXT NOT NULL,
    "bridgeRuntimeId" TEXT NOT NULL,
    "requesterUserId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "scopeType" "BridgeAccessScopeType" NOT NULL,
    "sessionGroupId" TEXT,
    "requestedExpiresAt" TIMESTAMP(3),
    "status" "BridgeAccessRequestStatus" NOT NULL DEFAULT 'pending',
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BridgeAccessRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BridgeRuntime_instanceId_key" ON "BridgeRuntime"("instanceId");

-- CreateIndex
CREATE INDEX "BridgeRuntime_organizationId_ownerUserId_idx" ON "BridgeRuntime"("organizationId", "ownerUserId");

-- CreateIndex
CREATE INDEX "BridgeRuntime_organizationId_connectedAt_idx" ON "BridgeRuntime"("organizationId", "connectedAt");

-- CreateIndex
CREATE INDEX "BridgeAccessGrant_bridgeRuntimeId_granteeUserId_revokedAt_idx" ON "BridgeAccessGrant"("bridgeRuntimeId", "granteeUserId", "revokedAt");

-- CreateIndex
CREATE INDEX "BridgeAccessGrant_granteeUserId_revokedAt_expiresAt_idx" ON "BridgeAccessGrant"("granteeUserId", "revokedAt", "expiresAt");

-- CreateIndex
CREATE INDEX "BridgeAccessGrant_sessionGroupId_revokedAt_idx" ON "BridgeAccessGrant"("sessionGroupId", "revokedAt");

-- CreateIndex
CREATE INDEX "BridgeAccessRequest_bridgeRuntimeId_requesterUserId_status_idx" ON "BridgeAccessRequest"("bridgeRuntimeId", "requesterUserId", "status");

-- CreateIndex
CREATE INDEX "BridgeAccessRequest_ownerUserId_status_createdAt_idx" ON "BridgeAccessRequest"("ownerUserId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "BridgeAccessRequest_sessionGroupId_status_idx" ON "BridgeAccessRequest"("sessionGroupId", "status");

-- AddForeignKey
ALTER TABLE "BridgeRuntime" ADD CONSTRAINT "BridgeRuntime_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeRuntime" ADD CONSTRAINT "BridgeRuntime_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeAccessGrant" ADD CONSTRAINT "BridgeAccessGrant_bridgeRuntimeId_fkey" FOREIGN KEY ("bridgeRuntimeId") REFERENCES "BridgeRuntime"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeAccessGrant" ADD CONSTRAINT "BridgeAccessGrant_granteeUserId_fkey" FOREIGN KEY ("granteeUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeAccessGrant" ADD CONSTRAINT "BridgeAccessGrant_grantedByUserId_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeAccessGrant" ADD CONSTRAINT "BridgeAccessGrant_sessionGroupId_fkey" FOREIGN KEY ("sessionGroupId") REFERENCES "SessionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeAccessRequest" ADD CONSTRAINT "BridgeAccessRequest_bridgeRuntimeId_fkey" FOREIGN KEY ("bridgeRuntimeId") REFERENCES "BridgeRuntime"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeAccessRequest" ADD CONSTRAINT "BridgeAccessRequest_requesterUserId_fkey" FOREIGN KEY ("requesterUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeAccessRequest" ADD CONSTRAINT "BridgeAccessRequest_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeAccessRequest" ADD CONSTRAINT "BridgeAccessRequest_sessionGroupId_fkey" FOREIGN KEY ("sessionGroupId") REFERENCES "SessionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeAccessRequest" ADD CONSTRAINT "BridgeAccessRequest_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
