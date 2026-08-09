import { traceCliOperations } from "@trace/cli-contract";
import { usage } from "../../errors.js";
import { defineCommand } from "../../runtime.js";
import {
  loadIntegrationBindings,
  loadIntegrationCatalog,
  requireCurrentAppGroup,
} from "./shared.js";

export const integrationRemoveCommand = defineCommand({
  path: ["integration", "remove"],
  description: "Remove an integration from the current Trace app",
  examples: ['"$TRACE_CLI" integration remove github --json'],
  effects: [
    "Deletes the matching binding from the current app and emits a binding-deleted event.",
    "Does not disconnect the underlying provider account.",
  ],
  output: "The removed binding ID and confirmation flag.",
  nextSteps: [
    'Run "$TRACE_CLI" integration list --json to verify that current-app access is absent.',
  ],
  positionals: [{ name: "integration", required: true }],
  async run(ctx, input) {
    const reference = input.positionals[0] ?? usage("Integration is required");
    const sessionGroupId = requireCurrentAppGroup(ctx);
    const client = await ctx.client();
    const [catalog, bindings] = await Promise.all([
      loadIntegrationCatalog(client),
      loadIntegrationBindings(client, sessionGroupId),
    ]);
    const integration = catalog.find((candidate) => candidate.id === reference);
    const binding = bindings.find(
      (candidate) =>
        candidate.id === reference ||
        (integration &&
          (candidate.integrationId === integration.id ||
            (!candidate.integrationId &&
              candidate.providerConfigKey === integration.providerConfigKey))),
    );
    if (!binding) usage(`Integration is not configured on this app: ${reference}`);
    const variables = { id: binding.id, sessionGroupId };
    await client.graphql<{ deleteAppIntegrationBinding: boolean }, typeof variables>(
      traceCliOperations.deleteAppIntegrationBinding,
      variables,
    );
    ctx.output({ removed: true, bindingId: binding.id }, `${binding.label} removed from this app`);
  },
});
