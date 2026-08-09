ALTER TYPE "EventType" ADD VALUE 'app_integration_request_started';

ALTER TABLE "AppIntegrationBinding" ADD COLUMN "integrationId" TEXT;

WITH ranked AS (
  SELECT
    "id",
    CASE
      WHEN LOWER("provider") = 'github' THEN 'github'
      WHEN LOWER("provider") = 'snowflake' THEN 'snowflake'
      ELSE NULL
    END AS "integrationId",
    ROW_NUMBER() OVER (
      PARTITION BY "sessionGroupId", CASE
        WHEN LOWER("provider") = 'github' THEN 'github'
        WHEN LOWER("provider") = 'snowflake' THEN 'snowflake'
        ELSE "providerConfigKey"
      END
      ORDER BY "updatedAt" DESC, "id" DESC
    ) AS "rank"
  FROM "AppIntegrationBinding"
)
UPDATE "AppIntegrationBinding" AS binding
SET "integrationId" = ranked."integrationId"
FROM ranked
WHERE binding."id" = ranked."id" AND ranked."rank" = 1;

CREATE UNIQUE INDEX "AppIntegrationBinding_sessionGroupId_integrationId_key"
ON "AppIntegrationBinding"("sessionGroupId", "integrationId");
