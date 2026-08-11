import { traceCliOperations } from "@trace/cli-contract";
import type {
  AppIntegrationBinding,
  IntegrationConnection,
  SupportedAppIntegration,
} from "@trace/gql";
import type { TraceClient } from "../../client.js";
import type { CommandContext } from "../../runtime.js";
export { requireCurrentAppGroup } from "../app/shared.js";
import { requireCurrentAppGroup } from "../app/shared.js";

export type IntegrationCatalogView = Pick<
  SupportedAppIntegration,
  "id" | "name" | "provider" | "providerConfigKey" | "description" | "guide" | "capabilities"
>;

export type IntegrationConnectionView = Pick<
  IntegrationConnection,
  | "id"
  | "ownerUserId"
  | "provider"
  | "providerConfigKey"
  | "displayName"
  | "kind"
  | "status"
  | "lastError"
>;

export type IntegrationBindingView = Pick<
  AppIntegrationBinding,
  | "id"
  | "integrationId"
  | "sessionGroupId"
  | "label"
  | "provider"
  | "providerConfigKey"
  | "executionIdentity"
  | "sharedConnectionId"
  | "allowedMethods"
  | "allowedPathPrefixes"
>;

export async function loadIntegrationCatalog(
  client: TraceClient,
): Promise<IntegrationCatalogView[]> {
  const result = await client.graphql<
    { supportedAppIntegrations: IntegrationCatalogView[] },
    Record<string, never>
  >(traceCliOperations.integrationCatalog, {});
  return result.supportedAppIntegrations;
}

export async function loadIntegrationBindings(
  client: TraceClient,
  sessionGroupId: string,
): Promise<IntegrationBindingView[]> {
  const variables = { sessionGroupId };
  const result = await client.graphql<
    { appIntegrationBindings: IntegrationBindingView[] },
    typeof variables
  >(traceCliOperations.appIntegrationBindings, variables);
  return result.appIntegrationBindings;
}
