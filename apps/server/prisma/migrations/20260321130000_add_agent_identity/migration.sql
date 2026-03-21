-- CreateEnum: AgentStatus
CREATE TYPE "AgentStatus" AS ENUM ('enabled', 'disabled');

-- CreateEnum: AutonomyMode
CREATE TYPE "AutonomyMode" AS ENUM ('observe', 'suggest', 'act');

-- CreateTable: AgentIdentity
CREATE TABLE "AgentIdentity" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Trace AI',
    "status" "AgentStatus" NOT NULL DEFAULT 'enabled',
    "autonomyMode" "AutonomyMode" NOT NULL DEFAULT 'observe',
    "soulFile" TEXT NOT NULL DEFAULT '',
    "dailyLimitCents" INTEGER NOT NULL DEFAULT 1000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique org
CREATE UNIQUE INDEX "AgentIdentity_organizationId_key" ON "AgentIdentity"("organizationId");

-- AddForeignKey
ALTER TABLE "AgentIdentity" ADD CONSTRAINT "AgentIdentity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: create an agent identity for every existing organization
INSERT INTO "AgentIdentity" ("id", "organizationId", "updatedAt")
SELECT gen_random_uuid(), "id", CURRENT_TIMESTAMP
FROM "Organization";
