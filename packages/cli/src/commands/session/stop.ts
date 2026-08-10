import { traceCliOperations } from "@trace/cli-contract";
import { defineCommand, optionBoolean } from "../../runtime.js";
import { printSession, resolveSessionId, type SessionView } from "./shared.js";

export const sessionStopCommand = defineCommand({
  path: ["session", "stop"],
  description: "Stop a running session",
  examples: [
    '"$TRACE_CLI" session stop <session-id> --json',
    '"$TRACE_CLI" session stop --self --json',
  ],
  effects: ["Stops the selected running session."],
  output: "The stopped session and its final reported status.",
  nextSteps: ['Run "$TRACE_CLI" session get <session-id> --json to confirm its status.'],
  notes: ["Stopping --self can end this agent's own ability to continue work."],
  positionals: [{ name: "session-id" }],
  options: [
    { name: "self", flag: "--self", kind: "boolean", description: "Target the current session" },
  ],
  async run(ctx, input) {
    const id = optionBoolean(input, "self")
      ? resolveSessionId(ctx)
      : resolveSessionId(ctx, input.positionals[0]);
    const client = await ctx.client();
    const result = await client.graphql<{ terminateSession: SessionView }, { id: string }>(
      traceCliOperations.stopSession,
      { id },
    );
    ctx.output({ session: result.terminateSession }, printSession(result.terminateSession));
  },
});
