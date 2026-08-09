import { traceCliOperations } from "@trace/cli-contract";
import { defineCommand, optionBoolean } from "../../runtime.js";
import { usage } from "../../errors.js";

export const integrationConnectCommand = defineCommand({
  path: ["integration", "connect"],
  description: "Create an authorization link for a personal or organization service account",
  examples: [
    "trace integration connect github --json",
    "trace integration connect github --service --json",
  ],
  effects: [
    "Creates a short-lived provider authorization session.",
    "Does not expose credentials or grant the current app access.",
  ],
  output: "The connectLink, its expiration time, integration ID, and personal or service kind.",
  nextSteps: [
    "Give connectLink to the user and wait for provider authorization to finish.",
    "Run integration list --json to confirm the connection became active.",
    "Run integration add to grant the current app least-privilege access.",
  ],
  notes: [
    "Use --service only when the user explicitly requests an organization-owned identity; organization-admin permission is required.",
  ],
  positionals: [{ name: "integration", required: true }],
  options: [
    {
      name: "service",
      flag: "--service",
      kind: "boolean",
      description: "Connect an organization service account (admins only)",
    },
  ],
  async run(ctx, input) {
    const integrationId = input.positionals[0] ?? usage("Integration is required");
    const client = await ctx.client();
    const variables = {
      input: {
        integrationId,
        kind: optionBoolean(input, "service") ? ("service" as const) : ("personal" as const),
      },
    };
    const result = await client.graphql<
      { createNangoConnectSession: { connectLink: string; expiresAt: string } },
      typeof variables
    >(traceCliOperations.createIntegrationConnectSession, variables);
    const session = result.createNangoConnectSession;
    ctx.output(
      { integrationId, kind: variables.input.kind, ...session },
      `Authorize ${integrationId}: ${session.connectLink}`,
    );
  },
});
