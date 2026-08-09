import { traceCliOperations } from "@trace/cli-contract";
import type { AppIntegrationBinding, IntegrationExecutionIdentity } from "@trace/gql";
import { usage } from "../../errors.js";
import { defineCommand, optionString } from "../../runtime.js";
import {
  loadIntegrationBindings,
  loadIntegrationCatalog,
  requireCurrentAppGroup,
} from "./shared.js";

export const integrationAddCommand = defineCommand({
  path: ["integration", "add"],
  description: "Add or update a supported integration on the current Trace app",
  examples: [
    "trace integration add github --capabilities profile --identity viewer --json",
    "trace integration add snowflake --identity service --connection <connection-id> --json",
  ],
  effects: [
    "Creates or updates one stable provider binding on the current app.",
    "Emits an app-integration binding event through the Trace service layer.",
  ],
  output: "The live integration guide, selected capability guides, and saved current-app binding.",
  nextSteps: [
    "Follow the returned guides to call the stable integration ID from a generated Node route.",
    "Have React call only that same-origin app route.",
    "Run integration list --json to verify app access.",
  ],
  notes: [
    "Viewer identity is the default and must not include --connection.",
    "Shared and service identities require a matching connection ID from integration list.",
    "When several capabilities exist, --capabilities is required to prevent accidental broad access.",
  ],
  positionals: [{ name: "integration", required: true }],
  options: [
    {
      name: "capabilities",
      flag: "--capabilities",
      kind: "string",
      valueName: "ID,ID",
      description: "Least-privilege capability IDs from integration list",
    },
    {
      name: "identity",
      flag: "--identity",
      kind: "string",
      valueName: "MODE",
      choices: ["viewer", "shared", "service"],
      description: "Account selection mode (default: viewer)",
    },
    {
      name: "connection",
      flag: "--connection",
      kind: "string",
      valueName: "ID",
      description: "Connected account ID for shared or service identity",
    },
  ],
  async run(ctx, input) {
    const integrationId = input.positionals[0] ?? usage("Integration is required");
    const sessionGroupId = requireCurrentAppGroup(ctx);
    const client = await ctx.client();
    const [catalog, bindings] = await Promise.all([
      loadIntegrationCatalog(client),
      loadIntegrationBindings(client, sessionGroupId),
    ]);
    const integration = catalog.find((candidate) => candidate.id === integrationId);
    if (!integration) usage(`Unsupported integration: ${integrationId}`);
    const requestedCapabilities = optionString(input, "capabilities");
    const capabilityIds = requestedCapabilities
      ? requestedCapabilities
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      : integration.capabilities.length === 1
        ? [integration.capabilities[0]?.id ?? ""]
        : usage(
            `--capabilities is required; choose from: ${integration.capabilities.map((item) => item.id).join(", ")}`,
          );
    const invalidCapability = capabilityIds.find(
      (id) => !integration.capabilities.some((capability) => capability.id === id),
    );
    if (invalidCapability) usage(`Unknown ${integrationId} capability: ${invalidCapability}`);
    const executionIdentity = (optionString(input, "identity") ??
      "viewer") as IntegrationExecutionIdentity;
    const sharedConnectionId = optionString(input, "connection") ?? null;
    if (executionIdentity === "viewer" && sharedConnectionId) {
      usage("--connection is only valid with shared or service identity");
    }
    if (executionIdentity !== "viewer" && !sharedConnectionId) {
      usage(`--connection is required with ${executionIdentity} identity`);
    }
    const existing = bindings.find(
      (binding) => binding.providerConfigKey === integration.providerConfigKey,
    );
    const variables = {
      input: {
        ...(existing ? { id: existing.id } : {}),
        sessionGroupId,
        integrationId,
        capabilityIds,
        executionIdentity,
        sharedConnectionId,
      },
    };
    const result = await client.graphql<
      { upsertAppIntegrationBinding: AppIntegrationBinding },
      typeof variables
    >(traceCliOperations.upsertAppIntegrationBinding, variables);
    ctx.output(
      {
        integration,
        selectedCapabilities: integration.capabilities.filter((capability) =>
          capabilityIds.includes(capability.id),
        ),
        binding: result.upsertAppIntegrationBinding,
      },
      `${integration.name} is ready for this app using ${executionIdentity} identity`,
    );
  },
});
