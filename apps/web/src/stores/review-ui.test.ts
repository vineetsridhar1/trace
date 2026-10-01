import { beforeEach, describe, expect, it } from "vitest";
import { reviewUiSelection, useReviewUiStore } from "./review-ui";

describe("review UI inquiry visibility", () => {
  beforeEach(() => useReviewUiStore.setState({ byReviewId: {}, deletedInquiryIds: [] }));

  it("collapses and restores one AI conversation", () => {
    useReviewUiStore.getState().toggleInquiryCollapsed("review-1", "inquiry-1");
    expect(
      reviewUiSelection(useReviewUiStore.getState(), "review-1").inquiryCollapsedOverrides,
    ).toEqual({ "inquiry-1": true });

    useReviewUiStore.getState().toggleInquiryCollapsed("review-1", "inquiry-1");
    expect(
      reviewUiSelection(useReviewUiStore.getState(), "review-1").inquiryCollapsedOverrides,
    ).toEqual({ "inquiry-1": false });
  });
});
