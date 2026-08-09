import { traceCliOperations } from "@trace/cli-contract";
import { defineCommand, optionBoolean, optionString } from "../../runtime.js";
import { printSession, resolveSessionId, type SessionView } from "./shared.js";

export const sessionRunCommand = defineCommand({
  path: ["session", "run"],
  description: "Start or resume a session run",
  positionals: [{ name: "session-id" }, { name: "prompt", variadic: true }],
  options: [
    { name: "self", flag: "--self", kind: "boolean", description: "Target the current session" },
    {
      name: "interactionMode",
      flag: "--interaction-mode",
      kind: "string",
      valueName: "MODE",
      description: "Interaction mode override",
    },
  ],
  async run(ctx, input) {
    const values = [...input.positionals];
    const id = optionBoolean(input, "self")
      ? resolveSessionId(ctx)
      : resolveSessionId(ctx, values.shift());
    const variables = {
      id,
      prompt: values.join(" ").trim() || null,
      interactionMode: optionString(input, "interactionMode") ?? null,
    };
    const client = await ctx.client();
    const result = await client.graphql<{ runSession: SessionView }, typeof variables>(
      traceCliOperations.runSession,
      variables,
    );
    ctx.output({ session: result.runSession }, printSession(result.runSession));
  },
});
