import { traceCliOperations } from "@trace/cli-contract";
import { defineCommand } from "../../runtime.js";
import {
  loadIntegrationBindings,
  loadIntegrationCatalog,
  type IntegrationConnectionView,
} from "./shared.js";

export const integrationListCommand = defineCommand({
  path: ["integration", "list"],
  description:
    "List supported integrations, connected accounts, usage guides, and current app access",
  examples: ["trace integration list --json"],
  effects: ["Read-only; does not connect an account or change app access."],
  output:
    "Supported integrations with capability and implementation guides, visible connections, current-app bindings, and the selected sessionGroupId.",
  nextSteps: [
    "Run integration connect <id> if a required account is missing.",
    "Run integration add <id> with the minimum capability IDs when app access is missing.",
  ],
  async run(ctx) {
    const client = await ctx.client();
    const sessionGroupId = ctx.env.TRACE_SESSION_GROUP_ID;
    const [integrations, connectionResult, bindings] = await Promise.all([
      loadIntegrationCatalog(client),
      client.graphql<
        { integrationConnections: IntegrationConnectionView[] },
        Record<string, never>
      >(traceCliOperations.integrationConnections, {}),
      sessionGroupId ? loadIntegrationBindings(client, sessionGroupId) : Promise.resolve([]),
    ]);
    const connections = connectionResult.integrationConnections;
    const value = {
      integrations: integrations.map((integration) => ({
        ...integration,
        connections: connections.filter(
          (connection) => connection.providerConfigKey === integration.providerConfigKey,
        ),
        appAccess: bindings.filter(
          (binding) => binding.providerConfigKey === integration.providerConfigKey,
        ),
      })),
      sessionGroupId: sessionGroupId ?? null,
    };
    ctx.output(
      value,
      value.integrations.length
        ? value.integrations
            .map((integration) => {
              const capabilities = integration.capabilities
                .map((capability) => capability.id)
                .join(", ");
              const connectionState = integration.connections.length
                ? `${integration.connections.length} connected account(s)`
                : "not connected";
              const accessState = integration.appAccess.length ? "added to this app" : "not added";
              return `${integration.id}\t${capabilities}\t${connectionState}\t${accessState}`;
            })
            .join("\n")
        : "No supported integrations",
    );
  },
});
