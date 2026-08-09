import { AppIntegrationService } from "./app-integrations.js";
import { nangoConnectionProvider } from "./nango-connection-provider.js";
import { integrationRequestAuditStore } from "./integration-request-audit.js";

export const appIntegrationService = new AppIntegrationService(
  nangoConnectionProvider,
  integrationRequestAuditStore,
);
