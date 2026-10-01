import { describe, expect, it } from "vitest";
import { hasProviderDelivery, reviewJson } from "./review.js";

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
