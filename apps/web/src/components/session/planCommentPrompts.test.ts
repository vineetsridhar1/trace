import { describe, expect, it } from "vitest";

import type { MarkdownSteerComment } from "../ui/markdownSteering";
import {
  buildApproveWithCommentsPrompt,
  buildCommentPrompt,
  formatCommentGroups,
  getCommentGroupIndex,
} from "./planCommentPrompts";

function comment(overrides: Partial<MarkdownSteerComment> = {}): MarkdownSteerComment {
  return {
    id: "2-p",
    markdown: "Review the implementation and run tests.",
    type: "p",
    commentId: "2-p:1",
    text: "Be more specific about verification.",
    ...overrides,
  };
}

describe("plan comment prompts", () => {
  it("sorts comment groups by the referenced markdown block index", () => {
    expect(getCommentGroupIndex([comment({ id: "12-ul" })])).toBe(12);
    expect(getCommentGroupIndex([comment({ id: "not-a-number" })])).toBe(0);
  });

  it("formats each comment group with the exact referenced plan block", () => {
    const formatted = formatCommentGroups([
      [
        comment(),
        comment({
          commentId: "2-p:2",
          text: "Include the expected command output.",
        }),
      ],
    ]);

    expect(formatted).toContain("Comment group 1 (p)");
    expect(formatted).toContain("These comments refer to this exact plan block:");
    expect(formatted).toContain("````markdown\nReview the implementation and run tests.\n````");
    expect(formatted).toContain("1. Be more specific about verification.");
    expect(formatted).toContain("2. Include the expected command output.");
  });

  it("builds a plan-mode revision prompt with optional note", () => {
    const prompt = buildCommentPrompt([[comment()]], "Keep the plan concise.");

    expect(prompt).toContain("Please revise the plan using these inline comments.");
    expect(prompt).toContain("Overall note:\nKeep the plan concise.");
    expect(prompt).not.toContain("Approved. Implement this plan");
  });

  it("builds an approval prompt with plan content when provided", () => {
    const prompt = buildApproveWithCommentsPrompt({
      planContent: "1. Do the work.",
      commentGroups: [[comment()]],
      note: "",
    });

    expect(prompt).toContain("Approved. Implement this plan");
    expect(prompt).toContain("Plan:\n1. Do the work.");
    expect(prompt).toContain("Inline comments:");
    expect(prompt).toContain("Review the implementation and run tests.");
  });

  it("builds keep-context approval guidance without duplicating plan content", () => {
    const prompt = buildApproveWithCommentsPrompt({
      commentGroups: [[comment()]],
      note: "Use the current context.",
    });

    expect(prompt).not.toContain("\n\nPlan:\n");
    expect(prompt).toContain("Overall note:\nUse the current context.");
  });
});
