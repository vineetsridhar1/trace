-- CreateEnum
CREATE TYPE "SessionApplicationProcessStatus" AS ENUM ('stopped', 'starting', 'running', 'stopping', 'exited', 'failed');

-- CreateEnum
CREATE TYPE "SessionSetupScriptRunStatus" AS ENUM ('running', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "SessionEndpointStatus" AS ENUM ('disabled', 'enabled', 'unavailable', 'revoked');

-- CreateEnum
CREATE TYPE "SessionEndpointAccessMode" AS ENUM ('private', 'public');

-- CreateEnum
CREATE TYPE "EndpointTrafficCaptureMode" AS ENUM ('metadata', 'headers', 'full');

-- AlterEnum
ALTER TYPE "EventType" ADD VALUE 'application_config_updated';
ALTER TYPE "EventType" ADD VALUE 'session_setup_script_started';
ALTER TYPE "EventType" ADD VALUE 'session_setup_script_completed';
ALTER TYPE "EventType" ADD VALUE 'session_setup_script_failed';
ALTER TYPE "EventType" ADD VALUE 'session_application_process_started';
ALTER TYPE "EventType" ADD VALUE 'session_application_process_stopped';
ALTER TYPE "EventType" ADD VALUE 'session_application_process_failed';
ALTER TYPE "EventType" ADD VALUE 'session_application_log_appended';
ALTER TYPE "EventType" ADD VALUE 'session_endpoint_created';
ALTER TYPE "EventType" ADD VALUE 'session_endpoint_forwarding_enabled';
ALTER TYPE "EventType" ADD VALUE 'session_endpoint_forwarding_disabled';
ALTER TYPE "EventType" ADD VALUE 'session_endpoint_rotated';
ALTER TYPE "EventType" ADD VALUE 'session_endpoint_access_updated';
ALTER TYPE "EventType" ADD VALUE 'session_endpoint_traffic_capture_updated';

-- CreateTable
CREATE TABLE "SessionSetupScriptRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sessionGroupId" TEXT NOT NULL,
    "repoId" TEXT NOT NULL,
    "scriptConfigId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "workingDirectory" TEXT NOT NULL,
    "status" "SessionSetupScriptRunStatus" NOT NULL DEFAULT 'running',
    "exitCode" INTEGER,
    "outputPreview" TEXT,
    "outputTruncated" BOOLEAN NOT NULL DEFAULT false,
    "lastError" TEXT,
    "startedByUserId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionSetupScriptRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionApplicationProcess" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sessionGroupId" TEXT NOT NULL,
    "repoId" TEXT NOT NULL,
    "appConfigId" TEXT NOT NULL,
    "processConfigId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "workingDirectory" TEXT NOT NULL,
    "status" "SessionApplicationProcessStatus" NOT NULL DEFAULT 'stopped',
    "runtimeInstanceId" TEXT,
    "bridgeProcessId" TEXT,
    "exitCode" INTEGER,
    "lastError" TEXT,
    "startedByUserId" TEXT,
    "startedAt" TIMESTAMP(3),
    "stoppedAt" TIMESTAMP(3),
    "lastHeartbeatAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionApplicationProcess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionApplicationLogEntry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "stream" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionApplicationLogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionEndpoint" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sessionGroupId" TEXT NOT NULL,
    "repoId" TEXT NOT NULL,
    "appConfigId" TEXT NOT NULL,
    "processConfigId" TEXT NOT NULL,
    "portConfigId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "targetPort" INTEGER NOT NULL,
    "protocol" TEXT NOT NULL DEFAULT 'http',
    "status" "SessionEndpointStatus" NOT NULL DEFAULT 'disabled',
    "accessMode" "SessionEndpointAccessMode" NOT NULL DEFAULT 'private',
    "trafficCaptureMode" "EndpointTrafficCaptureMode" NOT NULL DEFAULT 'metadata',
    "currentRuntimeInstanceId" TEXT,
    "enabledByUserId" TEXT,
    "enabledAt" TIMESTAMP(3),
    "disabledAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EndpointTrafficEntry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "endpointId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "requestMethod" TEXT NOT NULL,
    "requestPath" TEXT NOT NULL,
    "requestQuery" TEXT,
    "requestHeaders" JSONB,
    "requestBodyPreview" TEXT,
    "requestBodyBytes" INTEGER,
    "requestTruncated" BOOLEAN NOT NULL DEFAULT false,
    "responseStatus" INTEGER,
    "responseHeaders" JSONB,
    "responseBodyPreview" TEXT,
    "responseBodyBytes" INTEGER,
    "responseTruncated" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,

    CONSTRAINT "EndpointTrafficEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SessionSetupScriptRun_organizationId_sessionGroupId_idx" ON "SessionSetupScriptRun"("organizationId", "sessionGroupId");
CREATE INDEX "SessionSetupScriptRun_sessionGroupId_scriptConfigId_startedAt_idx" ON "SessionSetupScriptRun"("sessionGroupId", "scriptConfigId", "startedAt");
CREATE UNIQUE INDEX "SessionApplicationProcess_sessionGroupId_appConfigId_processConfigId_key" ON "SessionApplicationProcess"("sessionGroupId", "appConfigId", "processConfigId");
CREATE INDEX "SessionApplicationProcess_organizationId_sessionGroupId_idx" ON "SessionApplicationProcess"("organizationId", "sessionGroupId");
CREATE INDEX "SessionApplicationProcess_runtimeInstanceId_idx" ON "SessionApplicationProcess"("runtimeInstanceId");
CREATE INDEX "SessionApplicationLogEntry_processId_sequence_idx" ON "SessionApplicationLogEntry"("processId", "sequence");
CREATE INDEX "SessionApplicationLogEntry_organizationId_timestamp_idx" ON "SessionApplicationLogEntry"("organizationId", "timestamp");
CREATE UNIQUE INDEX "SessionEndpoint_key_key" ON "SessionEndpoint"("key");
CREATE UNIQUE INDEX "SessionEndpoint_sessionGroupId_appConfigId_processConfigId_portConfigId_key" ON "SessionEndpoint"("sessionGroupId", "appConfigId", "processConfigId", "portConfigId");
CREATE INDEX "SessionEndpoint_organizationId_sessionGroupId_idx" ON "SessionEndpoint"("organizationId", "sessionGroupId");
CREATE INDEX "SessionEndpoint_status_idx" ON "SessionEndpoint"("status");
CREATE INDEX "EndpointTrafficEntry_endpointId_startedAt_idx" ON "EndpointTrafficEntry"("endpointId", "startedAt");
CREATE INDEX "EndpointTrafficEntry_organizationId_startedAt_idx" ON "EndpointTrafficEntry"("organizationId", "startedAt");

-- AddForeignKey
ALTER TABLE "SessionSetupScriptRun" ADD CONSTRAINT "SessionSetupScriptRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionSetupScriptRun" ADD CONSTRAINT "SessionSetupScriptRun_sessionGroupId_fkey" FOREIGN KEY ("sessionGroupId") REFERENCES "SessionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionSetupScriptRun" ADD CONSTRAINT "SessionSetupScriptRun_repoId_fkey" FOREIGN KEY ("repoId") REFERENCES "Repo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionApplicationProcess" ADD CONSTRAINT "SessionApplicationProcess_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionApplicationProcess" ADD CONSTRAINT "SessionApplicationProcess_sessionGroupId_fkey" FOREIGN KEY ("sessionGroupId") REFERENCES "SessionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionApplicationProcess" ADD CONSTRAINT "SessionApplicationProcess_repoId_fkey" FOREIGN KEY ("repoId") REFERENCES "Repo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionApplicationLogEntry" ADD CONSTRAINT "SessionApplicationLogEntry_processId_fkey" FOREIGN KEY ("processId") REFERENCES "SessionApplicationProcess"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionEndpoint" ADD CONSTRAINT "SessionEndpoint_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionEndpoint" ADD CONSTRAINT "SessionEndpoint_sessionGroupId_fkey" FOREIGN KEY ("sessionGroupId") REFERENCES "SessionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionEndpoint" ADD CONSTRAINT "SessionEndpoint_repoId_fkey" FOREIGN KEY ("repoId") REFERENCES "Repo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EndpointTrafficEntry" ADD CONSTRAINT "EndpointTrafficEntry_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "SessionEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
