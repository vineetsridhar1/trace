ALTER TABLE "AppDeployment"
ADD COLUMN "target" TEXT NOT NULL DEFAULT 'service',
ADD COLUMN "spec" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN "appSlug" TEXT NOT NULL DEFAULT '',
ADD COLUMN "staticPrefix" TEXT,
ADD COLUMN "serviceName" TEXT;

CREATE INDEX "AppDeployment_appSlug_status_idx"
ON "AppDeployment"("appSlug", "status");
