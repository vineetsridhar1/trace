-- CreateEnum
CREATE TYPE "EntitySummaryType" AS ENUM ('rolling', 'milestone');

-- CreateTable
CREATE TABLE "EntitySummary" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "entityType" "ScopeType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "summaryType" "EntitySummaryType" NOT NULL DEFAULT 'rolling',
    "content" TEXT NOT NULL,
    "startEventId" TEXT,
    "endEventId" TEXT,
    "eventCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntitySummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EntitySummary_organizationId_entityType_entityId_summaryType_key" ON "EntitySummary"("organizationId", "entityType", "entityId", "summaryType");

-- CreateIndex
CREATE INDEX "EntitySummary_organizationId_entityType_entityId_idx" ON "EntitySummary"("organizationId", "entityType", "entityId");

-- AddForeignKey
ALTER TABLE "EntitySummary" ADD CONSTRAINT "EntitySummary_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
