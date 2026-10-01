import { describe, expect, it } from "vitest";
import {
  guideGenerationInstruction,
  parseGuideResponse,
  REVIEW_GUIDE_SKILL_INSTRUCTION,
  validateReviewGuide,
} from "./review-guide.js";

const files = [{ path: "src/a.ts" }, { path: "src/b.ts" }];

const chapter = (overrides: Record<string, unknown>) => ({
  id: "a",
  title: "A",
  explanation: "Explanation",
  implications: ["One"],
  files: ["src/a.ts"],
  ...overrides,
});

const guide = (overrides: Record<string, unknown>) => ({
  title: "Change",
  intent: "Explain it",
  chapters: [chapter({})],
  everythingElse: ["src/b.ts"],
  ...overrides,
});

describe("review guide contract", () => {
  it("normalizes list and legacy string implications", () => {
    const validated = validateReviewGuide(
      guide({
        chapters: [
          chapter({ implications: ["One", "Two"] }),
          chapter({ id: "b", implications: "Legacy implication", files: ["src/b.ts"] }),
        ],
        everythingElse: [],
      }),
      files,
    );

    expect(validated.chapters[0]?.implications).toEqual(["One", "Two"]);
    expect(validated.chapters[1]?.implications).toEqual(["Legacy implication"]);
  });

  it("keeps each chapter's own file list so the Guide can render their diffs together", () => {
    const validated = validateReviewGuide(
      guide({ chapters: [chapter({ files: ["src/a.ts", "src/b.ts"] })], everythingElse: [] }),
      files,
    );

    expect(validated.chapters[0]?.files).toEqual(["src/a.ts", "src/b.ts"]);
  });

  it("accepts repeated inline anchors into the same chapter file", () => {
    const validated = validateReviewGuide(
      guide({
        chapters: [
          chapter({
            explanation: "Calls [[init|src/a.ts|3-5]] and then [[flush|src/a.ts|11-11]].",
            implications: ["[[flush|src/a.ts|11-11]] runs on every request."],
          }),
        ],
      }),
      files,
    );

    expect(validated.chapters[0]?.explanation).toContain("[[flush|src/a.ts|11-11]]");
  });

  it("rejects an inline anchor pointing outside the chapter's own files", () => {
    expect(() =>
      validateReviewGuide(
        guide({ chapters: [chapter({ explanation: "See [[other|src/b.ts|2-2]]." })] }),
        files,
      ),
    ).toThrow('Guide chapter "A" links to src/b.ts, which is not one of that chapter\'s files');
  });

  it("rejects an inline anchor with an inverted line range", () => {
    expect(() =>
      validateReviewGuide(
        guide({ chapters: [chapter({ implications: ["See [[init|src/a.ts|9-2]]."] })] }),
        files,
      ),
    ).toThrow('Guide chapter "A" links to an invalid line range in src/a.ts');
  });

  it("rejects a file repeated between a chapter and everything else", () => {
    expect(() =>
      validateReviewGuide(guide({ everythingElse: ["src/a.ts", "src/b.ts"] }), files),
    ).toThrow("Guide repeats changed file: src/a.ts");
  });

  it("rejects a chapter file that is not in the snapshot", () => {
    expect(() =>
      validateReviewGuide(guide({ chapters: [chapter({ files: ["src/missing.ts"] })] }), files),
    ).toThrow("Guide references an unknown file: src/missing.ts");
  });

  it("rejects a snapshot file no chapter accounts for", () => {
    expect(() => validateReviewGuide(guide({ everythingElse: [] }), files)).toThrow(
      "Guide omits changed file: src/b.ts",
    );
  });

  it("tells the coding session the exact paths, coverage rule, and anchor syntax", () => {
    const instruction = guideGenerationInstruction(files);
    expect(instruction).toContain('["src/a.ts","src/b.ts"]');
    expect(instruction).toContain("exactly once");
    expect(instruction).toContain('"files":["..."]');
    expect(instruction).toContain("[[label|path|startLine-endLine]]");
  });

  it("requires the attached session to load the Guide methodology", () => {
    expect(REVIEW_GUIDE_SKILL_INSTRUCTION).toContain(
      "$TRACE_SKILLS_DIR/review-guide/SKILL.md completely",
    );
  });

  it("accepts JSON wrapped in a Markdown fence", () => {
    expect(parseGuideResponse('```json\n{"title":"Guide"}\n```')).toEqual({ title: "Guide" });
  });
});
