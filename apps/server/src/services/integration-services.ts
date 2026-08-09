import { AppIntegrationService } from "./app-integrations.js";
import { nangoConnectionProvider } from "./nango-connection-provider.js";

export const appIntegrationService = new AppIntegrationService(nangoConnectionProvider);
