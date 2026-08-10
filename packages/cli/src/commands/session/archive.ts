import { traceCliOperations } from "@trace/cli-contract";
import { usage } from "../../errors.js";
import { defineCommand, optionBoolean } from "../../runtime.js";
import { getSession, resolveSessionId, type GroupView } from "./shared.js";

export const sessionArchiveCommand = defineCommand({
  path: ["session", "archive"],
  description: "Archive a session's group",
  examples: [
    '"$TRACE_CLI" session archive <session-id> --json',
    '"$TRACE_CLI" session archive --self --json',
  ],
  effects: ["Archives the selected session's entire group."],
  output: "The archived session group and its archive timestamp.",
  nextSteps: ['Run "$TRACE_CLI" session list --include-archived --json to find the group again.'],
  notes: ["Archiving --self can end this agent's own ability to continue work."],
  positionals: [{ name: "session-id" }],
  options: [
    { name: "self", flag: "--self", kind: "boolean", description: "Target the current session" },
  ],
  async run(ctx, input) {
    const id = optionBoolean(input, "self")
      ? resolveSessionId(ctx)
      : resolveSessionId(ctx, input.positionals[0]);
    const session = await getSession(ctx, id);
    if (!session.sessionGroupId) usage("This session has no group to archive");
    const client = await ctx.client();
    const result = await client.graphql<{ archiveSessionGroup: GroupView | null }, { id: string }>(
      traceCliOperations.archiveSession,
      { id: session.sessionGroupId },
    );
    ctx.output(
      { sessionGroup: result.archiveSessionGroup },
      `Archived session group (${session.sessionGroupId})`,
    );
  },
});
