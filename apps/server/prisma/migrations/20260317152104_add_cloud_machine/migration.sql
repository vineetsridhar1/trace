-- CreateEnum
CREATE TYPE "CloudMachineStatus" AS ENUM ('creating', 'started', 'stopped', 'destroyed');

-- CreateTable
CREATE TABLE "CloudMachine" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerMachineId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "status" "CloudMachineStatus" NOT NULL DEFAULT 'creating',
    "bridgeToken" TEXT NOT NULL,
    "runtimeInstanceId" TEXT NOT NULL,
    "providerMetadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CloudMachine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CloudMachine_bridgeToken_key" ON "CloudMachine"("bridgeToken");

-- CreateIndex
CREATE UNIQUE INDEX "CloudMachine_runtimeInstanceId_key" ON "CloudMachine"("runtimeInstanceId");

-- CreateIndex
CREATE INDEX "CloudMachine_status_idx" ON "CloudMachine"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CloudMachine_userId_organizationId_key" ON "CloudMachine"("userId", "organizationId");

-- AddForeignKey
ALTER TABLE "CloudMachine" ADD CONSTRAINT "CloudMachine_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CloudMachine" ADD CONSTRAINT "CloudMachine_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
