-- CreateEnum
CREATE TYPE "SessionRole" AS ENUM ('primary', 'autopilot_controller');

-- CreateEnum
CREATE TYPE "SessionAutopilotStatus" AS ENUM ('disabled', 'waiting', 'reviewing', 'continuing', 'needs_human', 'paused', 'error');

-- CreateEnum
CREATE TYPE "AutopilotDecisionAction" AS ENUM ('continue_worker', 'request_human_validation', 'stop');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EventType" ADD VALUE 'session_autopilot_created';
ALTER TYPE "EventType" ADD VALUE 'session_autopilot_updated';
ALTER TYPE "EventType" ADD VALUE 'session_autopilot_disabled';
ALTER TYPE "EventType" ADD VALUE 'session_autopilot_review_requested';
ALTER TYPE "EventType" ADD VALUE 'session_autopilot_decision_applied';
ALTER TYPE "EventType" ADD VALUE 'session_autopilot_handoff_requested';

-- AlterEnum
ALTER TYPE "InboxItemType" ADD VALUE 'autopilot_validation_request';

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "role" "SessionRole" NOT NULL DEFAULT 'primary';

-- CreateTable
CREATE TABLE "SessionAutopilot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sessionGroupId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "status" "SessionAutopilotStatus" NOT NULL DEFAULT 'disabled',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "controllerTool" "CodingTool" NOT NULL,
    "controllerModel" TEXT,
    "controllerHosting" "HostingMode" NOT NULL,
    "controllerRuntimeInstanceId" TEXT,
    "controllerSessionId" TEXT,
    "activeSessionId" TEXT,
    "playbook" TEXT NOT NULL,
    "customInstructions" TEXT,
    "lastCheckpointSha" TEXT,
    "lastDecisionAction" "AutopilotDecisionAction",
    "lastDecisionSummary" TEXT,
    "lastEvaluatedAt" TIMESTAMP(3),
    "lastHumanInboxItemId" TEXT,
    "consecutiveAutoTurns" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionAutopilot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SessionAutopilot_sessionGroupId_key" ON "SessionAutopilot"("sessionGroupId");

-- AddForeignKey
ALTER TABLE "SessionAutopilot" ADD CONSTRAINT "SessionAutopilot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionAutopilot" ADD CONSTRAINT "SessionAutopilot_sessionGroupId_fkey" FOREIGN KEY ("sessionGroupId") REFERENCES "SessionGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionAutopilot" ADD CONSTRAINT "SessionAutopilot_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
