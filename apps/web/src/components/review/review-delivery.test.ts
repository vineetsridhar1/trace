import { describe, expect, it } from "vitest";
import type { ReviewThread } from "@trace/gql";
import { isPendingGitHubThread } from "./review-delivery";

function thread(overrides: Partial<ReviewThread> = {}): ReviewThread {
  return {
    originSnapshotId: "snapshot-latest",
    scope: "line",
    deliveryStatus: "trace_only",
    providerReviewId: null,
    providerCommentId: null,
    comments: [
      {
        body: "Please handle this edge case.",
        deletedAt: null,
        providerCommentId: null,
      },
    ],
    ...overrides,
  } as ReviewThread;
}

describe("isPendingGitHubThread", () => {
  it("includes a Trace comment from the latest snapshot", () => {
    expect(isPendingGitHubThread(thread(), "snapshot-latest")).toBe(true);
  });

  it("excludes comments from an earlier snapshot", () => {
    expect(
      isPendingGitHubThread(thread({ originSnapshotId: "snapshot-old" }), "snapshot-latest"),
    ).toBe(false);
  });

  it("excludes threads already represented on GitHub", () => {
    expect(
      isPendingGitHubThread(thread({ providerReviewId: "github-review-1" }), "snapshot-latest"),
    ).toBe(false);
    expect(
      isPendingGitHubThread(thread({ providerCommentId: "github-comment-1" }), "snapshot-latest"),
    ).toBe(false);
    expect(isPendingGitHubThread(thread({ deliveryStatus: "delivered" }), "snapshot-latest")).toBe(
      false,
    );
  });

  it("requires a non-deleted comment", () => {
    expect(
      isPendingGitHubThread(
        thread({
          comments: [
            {
              body: "Deleted",
              deletedAt: "2026-10-01T00:00:00.000Z",
              providerCommentId: null,
            },
          ] as ReviewThread["comments"],
        }),
        "snapshot-latest",
      ),
    ).toBe(false);
  });
});
