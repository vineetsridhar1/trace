import { traceCliOperations } from "@trace/cli-contract";
import { usage } from "../../errors.js";
import { defineCommand, optionBoolean } from "../../runtime.js";
import { resolveSessionId } from "./shared.js";

export const sessionLinkPrCommand = defineCommand({
  path: ["session", "link-pr"],
  description: "Link a pull request to a session",
  examples: [
    '"$TRACE_CLI" session link-pr https://github.com/acme/app/pull/42 --self --json',
    '"$TRACE_CLI" session link-pr <pr-url> <session-id> --json',
  ],
  effects: ["Marks the session group as in review and emits the pull-request-opened event."],
  output: "The linked session group and its pull request URL.",
  nextSteps: [
    'Use "$TRACE_CLI" repo attach-remote or channel link-repo when Trace reports a missing association, then retry this command.',
    "Report the PR URL only after Trace confirms the link.",
  ],
  notes: [
    "Trace validates that the session repository, channel repository, and GitHub PR all agree before linking.",
    "Missing associations are never filled or replaced silently.",
  ],
  positionals: [{ name: "pr-url", required: true }, { name: "session-id" }],
  options: [
    { name: "self", flag: "--self", kind: "boolean", description: "Link the current session" },
  ],
  async run(ctx, input) {
    const prUrl = input.positionals[0]?.trim();
    if (!prUrl) usage("A pull request URL is required");
    const sessionId = optionBoolean(input, "self")
      ? resolveSessionId(ctx)
      : resolveSessionId(ctx, input.positionals[1]);
    const result = await (
      await ctx.client()
    ).graphql<
      {
        linkSessionPullRequest: { id: string; name: string; status: string; prUrl: string | null };
      },
      { sessionId: string; prUrl: string }
    >(traceCliOperations.linkSessionPullRequest, { sessionId, prUrl });
    ctx.output(
      { sessionGroup: result.linkSessionPullRequest },
      `Linked pull request to ${sessionId}`,
    );
  },
});
