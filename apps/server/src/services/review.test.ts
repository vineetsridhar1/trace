import { describe, expect, it } from "vitest";
import {
  hasProviderDelivery,
  isFinishedInquiryState,
  reviewJson,
  threadAppliesToSnapshot,
} from "./review.js";

describe("reviewJson", () => {
  it("serializes Prisma bigint fields for review event payloads", () => {
    expect(
      reviewJson({
        review: {
          attachedSession: {
            inputTokens: 12n,
            outputTokens: 34n,
          },
        },
      }),
    ).toEqual({
      review: {
        attachedSession: {
          inputTokens: 12,
          outputTokens: 34,
        },
      },
    });
  });
});

describe("hasProviderDelivery", () => {
  it("recognizes every persisted GitHub delivery marker", () => {
    expect(
      hasProviderDelivery({
        deliveryStatus: "delivered",
        comments: [],
      }),
    ).toBe(true);
    expect(
      hasProviderDelivery({
        deliveryStatus: "trace_only",
        providerReviewId: "review-1",
        comments: [],
      }),
    ).toBe(true);
    expect(
      hasProviderDelivery({
        deliveryStatus: "trace_only",
        comments: [{ providerCommentId: "comment-1" }],
      }),
    ).toBe(true);
  });

  it("keeps an undelivered Trace thread eligible", () => {
    expect(
      hasProviderDelivery({
        deliveryStatus: "trace_only",
        providerReviewId: null,
        providerCommentId: null,
        comments: [{ providerCommentId: null }],
      }),
    ).toBe(false);
  });
});

describe("isFinishedInquiryState", () => {
  it("only permits resolving terminal AI conversations", () => {
    expect(isFinishedInquiryState("queued")).toBe(false);
    expect(isFinishedInquiryState("running")).toBe(false);
    expect(isFinishedInquiryState("completed")).toBe(true);
    expect(isFinishedInquiryState("failed")).toBe(true);
    expect(isFinishedInquiryState("cancelled")).toBe(true);
  });
});

describe("threadAppliesToSnapshot", () => {
  it("uses the reconciled live anchor rather than immutable origin", () => {
    expect(
      threadAppliesToSnapshot(
        { scope: "line", anchor: { snapshotId: "snapshot-2", status: "relocated" } },
        "snapshot-2",
      ),
    ).toBe(true);
  });

  it("rejects an outdated live anchor", () => {
    expect(
      threadAppliesToSnapshot(
        { scope: "line", anchor: { snapshotId: "snapshot-2", status: "outdated" } },
        "snapshot-2",
      ),
    ).toBe(false);
  });

  it("rejects an anchor still pointing at an earlier snapshot", () => {
    expect(
      threadAppliesToSnapshot(
        { scope: "line", anchor: { snapshotId: "snapshot-1", status: "current" } },
        "snapshot-2",
      ),
    ).toBe(false);
  });

  it("keeps an unanchored review-level comment deliverable after a new snapshot", () => {
    expect(threadAppliesToSnapshot({ scope: "general", anchor: null }, "snapshot-2")).toBe(true);
  });

  it("never delivers a Guide annotation", () => {
    expect(
      threadAppliesToSnapshot({ scope: "guide_explanation", anchor: null }, "snapshot-1"),
    ).toBe(false);
  });
});
