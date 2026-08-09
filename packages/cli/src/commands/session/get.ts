import { defineCommand } from "../../runtime.js";
import { getSession, printSession, resolveSessionId } from "./shared.js";

export const sessionGetCommand = defineCommand({
  path: ["session", "get"],
  description: "Get a session, defaulting to TRACE_SESSION_ID",
  positionals: [{ name: "session-id" }],
  async run(ctx, input) {
    const session = await getSession(ctx, resolveSessionId(ctx, input.positionals[0]));
    ctx.output({ session }, printSession(session));
  },
});
