-- CreateEnum
CREATE TYPE "SessionEndpointSource" AS ENUM ('application', 'manual');

-- AlterTable
ALTER TABLE "SessionEndpoint"
ADD COLUMN "source" "SessionEndpointSource" NOT NULL DEFAULT 'application',
ADD COLUMN "manualPort" INTEGER,
ALTER COLUMN "appConfigId" DROP NOT NULL,
ALTER COLUMN "processConfigId" DROP NOT NULL,
ALTER COLUMN "portConfigId" DROP NOT NULL;

-- Migrate endpoints created by the initial arbitrary-port implementation.
UPDATE "SessionEndpoint"
SET
  "source" = 'manual',
  "manualPort" = "targetPort",
  "appConfigId" = NULL,
  "processConfigId" = NULL,
  "portConfigId" = NULL
WHERE
  "appConfigId" = '__trace_manual_port__'
  AND "processConfigId" = '__trace_manual_port__';

-- Keep application ownership and standalone port ownership mutually exclusive.
ALTER TABLE "SessionEndpoint"
ADD CONSTRAINT "SessionEndpoint_source_fields_check" CHECK (
  (
    "source" = 'manual'
    AND "manualPort" IS NOT NULL
    AND "manualPort" = "targetPort"
    AND "appConfigId" IS NULL
    AND "processConfigId" IS NULL
    AND "portConfigId" IS NULL
  )
  OR
  (
    "source" = 'application'
    AND "manualPort" IS NULL
    AND "appConfigId" IS NOT NULL
    AND "processConfigId" IS NOT NULL
    AND "portConfigId" IS NOT NULL
  )
);

-- CreateIndex
CREATE UNIQUE INDEX "SessionEndpoint_sessionGroupId_manualPort_key"
ON "SessionEndpoint"("sessionGroupId", "manualPort");
