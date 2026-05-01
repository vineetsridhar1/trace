DROP INDEX IF EXISTS "BridgeRuntime_instanceId_key";

CREATE UNIQUE INDEX "BridgeRuntime_instanceId_organizationId_key"
  ON "BridgeRuntime"("instanceId", "organizationId");
