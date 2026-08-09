import { traceCliOperations } from "@trace/cli-contract";
import { defineCommand, optionBoolean } from "../../runtime.js";
import { usage } from "../../errors.js";

export const integrationConnectCommand = defineCommand({
  path: ["integration", "connect"],
  description: "Create an authorization link for a personal or organization service account",
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
