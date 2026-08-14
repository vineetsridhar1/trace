import { defineCommand } from "../../runtime.js";
import { getSession, printSession, resolveSessionId } from "./shared.js";

export const sessionGetCommand = defineCommand({
  path: ["session", "get"],
  description: "Get a session, defaulting to TRACE_SESSION_ID",
  examples: [
    '"$TRACE_CLI" session get --json',
    '"$TRACE_CLI" session get <session-id> --json',
  ],
  effects: ["Read-only; does not change the session."],
  output: "The session's status, tool, hosting, group, channel, repository, and branch.",
  nextSteps: [
    'Run "$TRACE_CLI" session events <session-id> --limit 50 --json for recent activity.',
    'Run "$TRACE_CLI" session send <session-id> "<message>" --queue --json for follow-up work.',
  ],
  positionals: [{ name: "session-id" }],
  async run(ctx, input) {
    const session = await getSession(ctx, resolveSessionId(ctx, input.positionals[0]));
    ctx.output({ session }, printSession(session));
  },
});
