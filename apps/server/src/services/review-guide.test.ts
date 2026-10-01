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

  it("preserves links outside the chapter and outside the changeset", () => {
    const explanation = "See [[other|src/b.ts|2-2]] and [[context|src/context.ts|5-8]].";
    const validated = validateReviewGuide(guide({ chapters: [chapter({ explanation })] }), files);
    expect(validated.chapters[0]?.explanation).toBe(explanation);
  });

  it("reduces invalid line ranges to labels without losing the explanation", () => {
    const validated = validateReviewGuide(
      guide({ chapters: [chapter({ implications: ["See [[init|src/a.ts|9-2]]."] })] }),
      files,
    );
    expect(validated.chapters[0]?.implications).toEqual(["See init."]);
  });

  it("drops a repeated path instead of discarding the generation", () => {
    const validated = validateReviewGuide(
      guide({ everythingElse: ["src/a.ts", "src/b.ts"] }),
      files,
    );

    expect(validated.chapters[0]?.files).toEqual(["src/a.ts"]);
    expect(validated.everythingElse).toEqual(["src/b.ts"]);
  });

  it("keeps contextual chapter files and still covers every changed file", () => {
    const validated = validateReviewGuide(
      guide({ chapters: [chapter({ files: ["src/context.ts"] })] }),
      files,
    );
    expect(validated.chapters[0]?.files).toEqual(["src/context.ts"]);
    expect(validated.everythingElse).toEqual(["src/b.ts", "src/a.ts"]);
  });

  it("repairs a uniquely matching bracket-escaped path in ownership and prose", () => {
    const actual = String.raw`app/game/\[gameId\]/page.tsx`;
    const requested = "app/game/[gameId]/page.tsx";
    const validated = validateReviewGuide(
      guide({
        chapters: [chapter({ files: [requested], explanation: `See [[game|${requested}|2-4]].` })],
        everythingElse: [requested],
      }),
      [{ path: actual }],
    );
    expect(validated.chapters[0]?.files).toEqual([actual]);
    expect(validated.chapters[0]?.explanation).toBe(`See [[game|${actual}|2-4]].`);
    expect(validated.everythingElse).toEqual([]);
  });

  it("prefers an exact path when escaped and unescaped filenames both exist", () => {
    const literal = "app/[id]/page.tsx";
    const escaped = String.raw`app/\[id\]/page.tsx`;
    const validated = validateReviewGuide(
      guide({
        chapters: [chapter({ files: [literal, escaped] })],
        everythingElse: [],
      }),
      [{ path: literal }, { path: escaped }],
    );
    expect(validated.chapters[0]?.files).toEqual([literal, escaped]);
  });

  it("does not guess when multiple bracket-escaped paths match", () => {
    const requested = "app/[id]/page.tsx";
    const candidates = [String.raw`app/\[id]/page.tsx`, String.raw`app/[id\]/page.tsx`];
    const validated = validateReviewGuide(
      guide({
        chapters: [chapter({ files: [requested] })],
        everythingElse: [],
      }),
      candidates.map((path) => ({ path })),
    );
    expect(validated.chapters[0]?.files).toEqual([requested]);
    expect(validated.everythingElse).toEqual(candidates);
  });

  it("bounds the changed-file prompt without dropping stored coverage", () => {
    const large = Array.from({ length: 501 }, (_, i) => ({ path: `src/${i}.ts` }));
    expect(guideGenerationInstruction(large)).toContain("first 500 of 501 paths");
    expect(
      validateReviewGuide(guide({ chapters: [], everythingElse: [] }), large).everythingElse,
    ).toHaveLength(501);
  });

  it("files an unaccounted snapshot path under everything else", () => {
    const validated = validateReviewGuide(guide({ everythingElse: [] }), files);

    expect(validated.everythingElse).toEqual(["src/b.ts"]);
  });

  it("accepts a chapter with no implications", () => {
    const validated = validateReviewGuide(
      guide({ chapters: [chapter({ implications: [] })] }),
      files,
    );

    expect(validated.chapters[0]?.implications).toEqual([]);
  });

  it("names the field a malformed chapter is missing", () => {
    expect(() =>
      validateReviewGuide(
        guide({ chapters: [{ id: "a", title: "A", files: ["src/a.ts"] }] }),
        files,
      ),
    ).toThrow('Guide chapter 1 is missing or malformed "explanation"');
  });

  it("tells the coding session the exact paths, coverage rule, and anchor syntax", () => {
    const instruction = guideGenerationInstruction(files);
    expect(instruction).toContain('["src/a.ts","src/b.ts"]');
    expect(instruction).toContain("same file may appear in multiple chapters");
    expect(instruction).toContain('"references":[{');
    expect(instruction).toContain("[[label|path|startLine-endLine]]");
  });

  it("includes the Guide methodology directly in the session message", () => {
    expect(REVIEW_GUIDE_SKILL_INSTRUCTION).toContain("# Trace Review Guide");
    expect(REVIEW_GUIDE_SKILL_INSTRUCTION).toContain("## Build the explanation");
    expect(REVIEW_GUIDE_SKILL_INSTRUCTION).not.toContain("$TRACE_SKILLS_DIR");
  });

  it("preserves ordered steps and the same file in multiple chapters", () => {
    const reference = {
      filePath: "src/a.ts",
      startLine: 10,
      endLine: 20,
      title: "Validate input",
      explanation: "Reject invalid input before writing.",
    };
    const validated = validateReviewGuide(
      guide({
        formatVersion: 2,
        chapters: [
          chapter({ references: [reference, { ...reference, filePath: "src/context.ts" }] }),
          chapter({
            id: "b",
            references: [{ ...reference, startLine: 40, endLine: 48, title: "Notify listeners" }],
          }),
        ],
      }),
      files,
    );
    expect(validated.chapters[0]?.references.map((ref) => ref.filePath)).toEqual([
      "src/a.ts",
      "src/context.ts",
    ]);
    expect(validated.chapters[1]?.files).toEqual(["src/a.ts"]);
    expect(validated.chapters[1]?.references[0]?.startLine).toBe(40);
    expect(validated.everythingElse).toEqual(["src/b.ts"]);
  });

  it("requires precise explained references in the new format", () => {
    expect(() => validateReviewGuide(guide({ formatVersion: 2 }), files)).toThrow(
      "needs specific code references",
    );
    const reference = { filePath: "src/a.ts", startLine: 1, endLine: 5 };
    expect(() =>
      validateReviewGuide(
        guide({ formatVersion: 2, chapters: [chapter({ references: [reference] })] }),
        files,
      ),
    ).toThrow("needs a title and explanation");
    expect(() =>
      validateReviewGuide(
        guide({
          formatVersion: 2,
          chapters: [chapter({ references: [{ ...reference, endLine: 81 }] })],
        }),
        files,
      ),
    ).toThrow("exceeds 80 lines");
  });

  it("does not suppress the same file in legacy chapters", () => {
    const validated = validateReviewGuide(
      guide({ chapters: [chapter({}), chapter({ id: "b" })] }),
      files,
    );
    expect(validated.chapters.map((ch) => ch.files)).toEqual([["src/a.ts"], ["src/a.ts"]]);
  });

  it("accepts JSON wrapped in a Markdown fence", () => {
    expect(parseGuideResponse('```json\n{"title":"Guide"}\n```')).toEqual({ title: "Guide" });
  });
});
