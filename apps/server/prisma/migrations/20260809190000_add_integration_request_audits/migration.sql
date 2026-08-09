CREATE TYPE "IntegrationRequestPhase" AS ENUM ('started', 'completed', 'failed');

CREATE TABLE "IntegrationRequestAuditEntry" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sessionGroupId" TEXT NOT NULL,
    "bindingId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "executionIdentity" "IntegrationExecutionIdentity" NOT NULL,
    "requestMethod" TEXT NOT NULL,
    "requestPath" TEXT NOT NULL,
    "phase" "IntegrationRequestPhase" NOT NULL,
    "responseStatus" INTEGER,
    "error" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "durationMs" INTEGER,

    CONSTRAINT "IntegrationRequestAuditEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "IntegrationRequestAuditEntry_requestId_timestamp_idx"
ON "IntegrationRequestAuditEntry"("requestId", "timestamp");

CREATE INDEX "IntegrationRequestAuditEntry_organizationId_timestamp_idx"
ON "IntegrationRequestAuditEntry"("organizationId", "timestamp");

CREATE INDEX "IntegrationRequestAuditEntry_sessionGroupId_timestamp_idx"
ON "IntegrationRequestAuditEntry"("sessionGroupId", "timestamp");

CREATE INDEX "IntegrationRequestAuditEntry_bindingId_timestamp_idx"
ON "IntegrationRequestAuditEntry"("bindingId", "timestamp");

ALTER TABLE "IntegrationRequestAuditEntry"
ADD CONSTRAINT "IntegrationRequestAuditEntry_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
