ALTER TABLE "AppDeployment"
ADD COLUMN "callbackTokenEncrypted" TEXT,
ADD COLUMN "callbackTokenIv" TEXT,
ADD COLUMN "clientMutationId" TEXT,
ADD COLUMN "dispatchAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "nextDispatchAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "dispatchedAt" TIMESTAMP(3);

CREATE INDEX "AppDeployment_status_nextDispatchAt_idx"
ON "AppDeployment"("status", "nextDispatchAt");

CREATE UNIQUE INDEX "AppDeployment_organizationId_clientMutationId_key"
ON "AppDeployment"("organizationId", "clientMutationId");
