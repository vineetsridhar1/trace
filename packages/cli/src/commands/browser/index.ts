import { traceCliOperations } from "@trace/cli-contract";
import { CliError, ExitCode } from "../../errors.js";
import { defineCommand } from "../../runtime.js";

function requireCurrentSessionGroup(env: Readonly<Record<string, string | undefined>>): string {
  const sessionGroupId = env.TRACE_SESSION_GROUP_ID;
  if (!sessionGroupId) {
    throw new CliError(
      "This command requires an active Trace session group",
      ExitCode.validation,
      "validation",
    );
  }
  return sessionGroupId;
}

export const browserCommands = [
  defineCommand({
    path: ["browser", "open"],
    description: "Open a website in a new browser tab in the current Trace workspace",
    examples: ['"$TRACE_CLI" browser open https://example.com --json'],
    effects: [
      "Requests a browser tab for the requesting user in the current session group.",
    ],
    output: "A request confirmation containing the website URL.",
    nextSteps: ["The tab opens when an eligible Trace client receives the request."],
    positionals: [{ name: "url", required: true }],
    async run(ctx, input) {
      const variables = {
        sessionGroupId: requireCurrentSessionGroup(ctx.env),
        url: input.positionals[0]!,
      };
      await (
        await ctx.client()
      ).graphql<{ openWorkspaceBrowser: boolean }, typeof variables>(
        traceCliOperations.openWorkspaceBrowser,
        variables,
      );
      ctx.output({ requested: true, url: variables.url }, `Requested ${variables.url}`);
    },
  }),
] as const;
