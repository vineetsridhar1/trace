import { describe, expect, it } from "vitest";
import type { ReviewAnchor } from "@trace/gql";
import {
  anchorPresentation,
  anchorRangeLabel,
  deliveryPresentation,
  inquiryPresentation,
  inquirySourceLabel,
} from "./review-states";

const anchor = (overrides: Partial<ReviewAnchor> = {}): ReviewAnchor =>
  ({
    snapshotId: "s1",
    filePath: "app/api/route.ts",
    side: "head",
    startLine: 11,
    endLine: 14,
    originalLine: null,
    selectedText: "",
    context: "",
    status: "current",
    ...overrides,
  }) as ReviewAnchor;

describe("anchorPresentation", () => {
  it("shows the line range when the anchor is still current", () => {
    expect(anchorPresentation(anchor()).label).toBe("L11–14");
  });

  it("reports where a relocated anchor moved to", () => {
    expect(anchorPresentation(anchor({ status: "relocated", originalLine: 8 })).label).toBe(
      "Moved L8→L11",
    );
  });

  it("falls back to a plain label when a relocated anchor has no original line", () => {
    expect(anchorPresentation(anchor({ status: "relocated" })).label).toBe("Relocated");
  });

  it("warns plainly when the anchored line is gone", () => {
    expect(anchorPresentation(anchor({ status: "outdated" })).label).toBe("Line no longer exists");
  });
});

describe("anchorRangeLabel", () => {
  it("collapses a single-line range", () => {
    expect(anchorRangeLabel(anchor({ startLine: 40, endLine: 40 }))).toBe("L40");
  });
});

describe("deliveryPresentation", () => {
  it("separates private drafts from published threads", () => {
    expect(deliveryPresentation("trace_only").label).toBe("Private");
    expect(deliveryPresentation("selected").label).toBe("In GitHub review");
    expect(deliveryPresentation("delivered").label).toBe("Delivered");
    expect(deliveryPresentation("delivery_failed").label).toBe("Failed");
  });
});

describe("inquiryPresentation", () => {
  it("marks only the head of the queue as next", () => {
    expect(inquiryPresentation("queued", true).label).toBe("Queued · next");
    expect(inquiryPresentation("queued", false).label).toBe("Queued");
  });

  it("labels the terminal states", () => {
    expect(inquiryPresentation("running", false).label).toBe("Running");
    expect(inquiryPresentation("completed", false).label).toBe("Answered");
    expect(inquiryPresentation("cancelled", false).label).toBe("Cancelled");
  });
});

describe("inquirySourceLabel", () => {
  it("prefers the anchored file and range", () => {
    expect(inquirySourceLabel("diff_anchor", anchor())).toBe("route.ts · L11–14");
  });

  it("names the origin when there is no anchor", () => {
    expect(inquirySourceLabel("guide_anchor", null)).toBe("Guide");
    expect(inquirySourceLabel("diff_anchor", null)).toBe("This PR");
  });
});
