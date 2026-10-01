import { describe, expect, it } from "vitest";
import {
  guideGenerationInstruction,
  parseGuideResponse,
  validateReviewGuide,
} from "./review-guide.js";

const files = [{ path: "src/a.ts" }, { path: "src/b.ts" }];

describe("review guide contract", () => {
  it("normalizes list and legacy string implications", () => {
    const guide = validateReviewGuide(
      {
        title: "Change",
        intent: "Explain it",
        chapters: [
          {
            id: "a",
            title: "A",
            explanation: "Explanation",
            implications: ["One", "Two"],
            references: [{ filePath: "src/a.ts", startLine: 1, endLine: 2 }],
          },
          {
            id: "b",
            title: "B",
            explanation: "Explanation",
            implications: "Legacy implication",
            references: [{ filePath: "src/b.ts", startLine: 3, endLine: 3 }],
          },
        ],
        everythingElse: [],
      },
      files,
    );

    expect(guide.chapters[0]?.implications).toEqual(["One", "Two"]);
    expect(guide.chapters[1]?.implications).toEqual(["Legacy implication"]);
  });

  it("rejects a file repeated between a chapter and everything else", () => {
    expect(() =>
      validateReviewGuide(
        {
          title: "Change",
          intent: "Explain it",
          chapters: [
            {
              id: "a",
              title: "A",
              explanation: "Explanation",
              implications: ["One"],
              references: [{ filePath: "src/a.ts", startLine: 1, endLine: 2 }],
            },
          ],
          everythingElse: ["src/a.ts", "src/b.ts"],
        },
        files,
      ),
    ).toThrow("Guide repeats changed file: src/a.ts");
  });

  it("tells the coding session the exact paths and unambiguous coverage rule", () => {
    const instruction = guideGenerationInstruction(files);
    expect(instruction).toContain('["src/a.ts","src/b.ts"]');
    expect(instruction).toContain("exactly once");
    expect(instruction).toContain('"implications":["..."]');
  });

  it("accepts JSON wrapped in a Markdown fence", () => {
    expect(parseGuideResponse('```json\n{"title":"Guide"}\n```')).toEqual({ title: "Guide" });
  });
});
