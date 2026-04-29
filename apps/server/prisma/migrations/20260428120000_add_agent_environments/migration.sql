ALTER TYPE "EventType" ADD VALUE 'agent_environment_created';
ALTER TYPE "EventType" ADD VALUE 'agent_environment_updated';
ALTER TYPE "EventType" ADD VALUE 'agent_environment_deleted';
ALTER TYPE "EventType" ADD VALUE 'session_runtime_start_requested';
ALTER TYPE "EventType" ADD VALUE 'session_runtime_provisioning';
ALTER TYPE "EventType" ADD VALUE 'session_runtime_connecting';
ALTER TYPE "EventType" ADD VALUE 'session_runtime_connected';
ALTER TYPE "EventType" ADD VALUE 'session_runtime_start_failed';
ALTER TYPE "EventType" ADD VALUE 'session_runtime_start_timed_out';
ALTER TYPE "EventType" ADD VALUE 'session_runtime_stopping';
ALTER TYPE "EventType" ADD VALUE 'session_runtime_stopped';
ALTER TYPE "EventType" ADD VALUE 'session_runtime_deprovision_failed';
ALTER TYPE "EventType" ADD VALUE 'session_runtime_disconnected';
ALTER TYPE "EventType" ADD VALUE 'session_runtime_reconnected';

CREATE TABLE "AgentEnvironment" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "adapterType" TEXT NOT NULL,
  "config" JSONB NOT NULL DEFAULT '{}',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AgentEnvironment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrgSecret" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "encryptedValue" TEXT NOT NULL,
  "iv" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OrgSecret_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AgentEnvironment_organizationId_idx" ON "AgentEnvironment"("organizationId");
CREATE INDEX "AgentEnvironment_organizationId_adapterType_idx" ON "AgentEnvironment"("organizationId", "adapterType");

CREATE UNIQUE INDEX "OrgSecret_organizationId_name_key" ON "OrgSecret"("organizationId", "name");
CREATE INDEX "OrgSecret_organizationId_idx" ON "OrgSecret"("organizationId");

ALTER TABLE "AgentEnvironment"
  ADD CONSTRAINT "AgentEnvironment_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrgSecret"
  ADD CONSTRAINT "OrgSecret_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
