CREATE UNIQUE INDEX "IntegrationConnection_one_service_per_org_provider_key"
ON "IntegrationConnection"("organizationId", "providerConfigKey")
WHERE "kind" = 'service' AND "status" <> 'revoked';
