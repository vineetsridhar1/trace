import { traceCliOperations } from "@trace/cli-contract";
import { usage } from "../../errors.js";
import { defineCommand, optionBoolean } from "../../runtime.js";
import { resolveSessionId } from "./shared.js";

export const sessionSetTitleCommand = defineCommand({
  path: ["session", "set-title"],
  description: "Set the title of a session",
  examples: [
    '"$TRACE_CLI" session set-title "Fix the login redirect loop" --self --json',
    '"$TRACE_CLI" session set-title "<title>" <session-id> --json',
  ],
  effects: ["Renames the session and emits the title event so open clients update."],
  output: "The renamed session.",
  nextSteps: [
    "Name the session once, at the start. Do not retitle unless the user asks for a rename.",
  ],
  notes: [
    "Use a short title (5-8 words) describing the overall goal of the session.",
    "Titles longer than 80 characters are truncated.",
  ],
  positionals: [{ name: "title", required: true }, { name: "session-id" }],
  options: [
    { name: "self", flag: "--self", kind: "boolean", description: "Title the current session" },
  ],
  async run(ctx, input) {
    const title = input.positionals[0]?.trim();
    if (!title) usage("A session title is required");
    const sessionId = optionBoolean(input, "self")
      ? resolveSessionId(ctx)
      : resolveSessionId(ctx, input.positionals[1]);
    const result = await (
      await ctx.client()
    ).graphql<
      { setSessionTitle: { id: string; name: string } },
      { sessionId: string; title: string }
    >(traceCliOperations.setSessionTitle, { sessionId, title });
    ctx.output({ session: result.setSessionTitle }, `Titled ${sessionId}`);
  },
});
