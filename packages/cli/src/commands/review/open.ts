import { traceCliOperations } from "@trace/cli-contract";
import { usage } from "../../errors.js";
import { defineCommand, optionBoolean } from "../../runtime.js";
import { resolveSessionId } from "../session/shared.js";

export const reviewOpenCommand = defineCommand({
  path: ["review", "open"],
  description: "Open or focus a pull request Review tab in the current session group",
  examples: ['"$TRACE_CLI" review open https://github.com/acme/app/pull/42 --self --json'],
  effects: [
    "Resolves the pull request, stores an immutable snapshot, and opens or reuses its Review tab.",
  ],
  output: "The review ID, current snapshot ID, and Review-tab UI path.",
  nextSteps: [
    "Open the returned UI path to inspect the frozen snapshot.",
    "Generate a Guide or ask anchored questions only when the user requests review assistance.",
  ],
  notes: [
    "Opening a review does not generate a Guide, send an agent message, edit code, or post to GitHub.",
    "The pull request must belong to the repository already linked to the current coding session.",
  ],
  positionals: [{ name: "pull-request-url", required: true }],
  options: [
    {
      name: "self",
      flag: "--self",
      kind: "boolean",
      description: "Use the current coding session",
    },
  ],
  async run(ctx, input) {
    const pullRequestUrl = input.positionals[0]?.trim();
    if (!pullRequestUrl) usage("A pull request URL is required");
    if (!optionBoolean(input, "self")) usage("review open currently requires --self");
    const sessionId = resolveSessionId(ctx);
    const result = await (
      await ctx.client()
    ).graphql<
      {
        openReviewForPullRequest: {
          id: string;
          currentSnapshotId: string | null;
          sourceSessionGroupId: string | null;
          channelId: string | null;
          attachedSessionId: string;
        };
      },
      { sessionId: string; pullRequestUrl: string }
    >(traceCliOperations.openReviewForPullRequest, { sessionId, pullRequestUrl });
    const review = result.openReviewForPullRequest;
    const groupPath = review.sourceSessionGroupId
      ? review.channelId
        ? `/c/${review.channelId}/g/${review.sourceSessionGroupId}`
        : `/g/${review.sourceSessionGroupId}`
      : "/";
    ctx.output(
      {
        reviewId: review.id,
        snapshotId: review.currentSnapshotId,
        uiPath: `${groupPath}?review=${review.id}`,
      },
      `Opened review ${review.id}`,
    );
  },
});
