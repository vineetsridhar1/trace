import { describe, expect, it } from "vitest";
import type { ReviewGuide } from "@trace/gql";
import { selectReviewGuide } from "./review-guide-selection";

const saved: ReviewGuide = {
  id: "saved",
  reviewId: "review",
  snapshotId: "old",
  generationInquiryId: "inquiry",
  status: "ready",
  title: "Saved walkthrough",
  intent: "",
  content: {},
  version: 8,
  createdAt: "2026-10-01T10:00:00Z",
};

describe("Guide selection across snapshot refreshes", () => {
  it("retains the saved Guide after the current snapshot changes", () => {
    expect(selectReviewGuide([saved], "review", "new")).toBe(saved);
  });

  it("prefers a Guide for the current snapshot over a later historical generation", () => {
    const current = { ...saved, id: "current", snapshotId: "new", version: 1 };
    const historical = { ...saved, createdAt: "2026-10-01T12:00:00Z" };
    expect(selectReviewGuide([historical, current], "review", "new")).toBe(current);
  });

  it("uses creation time across snapshots because their version numbers restart", () => {
    const newer = {
      ...saved,
      id: "newer",
      snapshotId: "middle",
      version: 1,
      createdAt: "2026-10-01T11:00:00Z",
    };
    expect(selectReviewGuide([saved, newer], "review", "new")).toBe(newer);
  });

  it("uses the latest version and never selects another review's Guide", () => {
    const replacement = { ...saved, id: "replacement", version: 9 };
    const other = { ...replacement, reviewId: "other", version: 10 };
    expect(selectReviewGuide([saved, replacement, other], "review", "old")).toBe(replacement);
    expect(selectReviewGuide([other], "review", "new")).toBeNull();
  });
});
