import { traceCliOperations } from "@trace/cli-contract";
import { usage } from "../../errors.js";
import { defineCommand, optionBoolean } from "../../runtime.js";
import { resolveSessionId } from "./shared.js";

export const sessionSetBranchCommand = defineCommand({
  path: ["session", "set-branch"],
  description: "Record the git branch a session is working on",
  examples: [
    '"$TRACE_CLI" session set-branch trace-abc123-login-fix --self --json',
    '"$TRACE_CLI" session set-branch <branch-name> <session-id> --json',
  ],
  effects: ["Points the session group at the branch and emits the branch event."],
  output: "The session, with its recorded branch.",
  nextSteps: ["Run this after creating or renaming a branch, once the branch is checked out."],
  notes: [
    "Trace verifies the name against the session's live workspace and ignores a branch that is not actually checked out.",
  ],
  positionals: [{ name: "branch", required: true }, { name: "session-id" }],
  options: [
    {
      name: "self",
      flag: "--self",
      kind: "boolean",
      description: "Record the branch for the current session",
    },
  ],
  async run(ctx, input) {
    const branch = input.positionals[0]?.trim();
    if (!branch) usage("A branch name is required");
    const sessionId = optionBoolean(input, "self")
      ? resolveSessionId(ctx)
      : resolveSessionId(ctx, input.positionals[1]);
    const result = await (
      await ctx.client()
    ).graphql<
      { setSessionBranch: { id: string; name: string; branch: string | null } },
      { sessionId: string; branch: string }
    >(traceCliOperations.setSessionBranch, { sessionId, branch });
    ctx.output({ session: result.setSessionBranch }, `Recorded branch for ${sessionId}`);
  },
});
