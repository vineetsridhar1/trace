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

  it("keeps an unanchored review-level comment deliverable across snapshots", () => {
    expect(
      isPendingGitHubThread(
        thread({ scope: "general", originSnapshotId: "snapshot-old" }),
        "snapshot-latest",
      ),
    ).toBe(true);
  });

  it("excludes guide annotations, which are Trace-internal", () => {
    expect(isPendingGitHubThread(thread({ scope: "guide_explanation" }), "snapshot-latest")).toBe(
      false,
    );
  });

  it("includes an older comment reconciled onto the latest snapshot", () => {
    expect(
      isPendingGitHubThread(
        thread({
          originSnapshotId: "snapshot-old",
          anchor: {
            snapshotId: "snapshot-latest",
            status: "relocated",
          } as ReviewThread["anchor"],
        }),
        "snapshot-latest",
      ),
    ).toBe(true);
  });

  it("excludes a reconciled comment whose code is gone", () => {
    expect(
      isPendingGitHubThread(
        thread({
          anchor: {
            snapshotId: "snapshot-latest",
            status: "outdated",
          } as ReviewThread["anchor"],
        }),
        "snapshot-latest",
      ),
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
