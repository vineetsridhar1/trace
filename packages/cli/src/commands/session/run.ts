import { traceCliOperations } from "@trace/cli-contract";
import { defineCommand, optionBoolean, optionString } from "../../runtime.js";
import { printSession, resolveSessionId, type SessionView } from "./shared.js";

export const sessionRunCommand = defineCommand({
  path: ["session", "run"],
  description: "Start or resume a session run",
  examples: [
    '"$TRACE_CLI" session run <session-id> "Continue with the revised scope" --json',
    '"$TRACE_CLI" session run --self --json',
  ],
  effects: ["Requests that the selected session start or resume work."],
  output: "The updated session status and execution settings.",
  nextSteps: ['Run "$TRACE_CLI" session events <session-id> --limit 50 --json to monitor progress.'],
  notes: ["Do not use this to repeat the prompt already supplied to session start."],
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
