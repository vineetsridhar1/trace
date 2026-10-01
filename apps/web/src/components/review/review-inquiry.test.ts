import { describe, expect, it } from "vitest";
import type { ReviewInquiry } from "@trace/gql";
import { inquiriesQueuedAhead, inquiryQueueLabel, reviewInquiryAnchor } from "./review-inquiry";

function inquiry(overrides: Partial<ReviewInquiry>): ReviewInquiry {
  return {
    id: "inquiry-current",
    position: 3,
    state: "queued",
    sourceKind: "diff_anchor",
    question: "Why is this safe?",
    ...overrides,
  } as ReviewInquiry;
}

describe("review inquiry presentation data", () => {
  it("normalizes a stored diff anchor", () => {
    expect(
      reviewInquiryAnchor(
        inquiry({
          anchor: { filePath: "src/app.ts", side: "head", startLine: 8, endLine: 10 },
        }),
      ),
    ).toEqual({ filePath: "src/app.ts", side: "head", startLine: 8, endLine: 10 });
  });

  it("finds active FIFO work ahead of a queued question", () => {
    const current = inquiry({});
    const running = inquiry({ id: "running", position: 1, state: "running" });
    const completed = inquiry({ id: "done", position: 2, state: "completed" });
    const later = inquiry({ id: "later", position: 4, state: "queued" });
    expect(inquiriesQueuedAhead(current, [later, completed, running])).toEqual([running]);
  });

  it("names Guide generation in queue context", () => {
    expect(
      inquiryQueueLabel(inquiry({ sourceKind: "guide_generation", question: "Generate guide" })),
    ).toBe("Guide generation");
  });
});
