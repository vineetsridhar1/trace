import { traceCliOperations } from "@trace/cli-contract";
import { defineCommand, optionBoolean } from "../../runtime.js";
import { printSession, resolveSessionId, type SessionView } from "./shared.js";

export const sessionStopCommand = defineCommand({
  path: ["session", "stop"],
  description: "Stop a running session",
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
