-- AlterEnum
ALTER TYPE "EventType" ADD VALUE 'model_routing_started';
ALTER TYPE "EventType" ADD VALUE 'model_routing_completed';
ALTER TYPE "EventType" ADD VALUE 'model_override_applied';

-- AlterTable
ALTER TABLE "Session" ADD COLUMN "modelSelectionMode" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "Session" ADD COLUMN "autoSelectedModel" TEXT;
