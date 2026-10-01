import { describe, expect, it } from "vitest";
import { guideAnchorLabel, normalizeGuideContent, parseGuideSegments } from "./guide-content";

describe("parseGuideSegments", () => {
  it("splits prose into text and anchor segments", () => {
    expect(parseGuideSegments("Calls [[init|src/a.ts|3-5]] first.")).toEqual([
      { kind: "text", text: "Calls " },
      {
        kind: "anchor",
        label: "init",
        anchor: { filePath: "src/a.ts", startLine: 3, endLine: 5 },
      },
      { kind: "text", text: " first." },
    ]);
  });

  it("keeps plain prose as a single segment", () => {
    expect(parseGuideSegments("Nothing to link.")).toEqual([
      { kind: "text", text: "Nothing to link." },
    ]);
  });

  it("reads several anchors into the same file", () => {
    const segments = parseGuideSegments("[[a|src/a.ts|1-1]] and [[b|src/a.ts|9-12]]");
    expect(segments.filter((segment) => segment.kind === "anchor")).toHaveLength(2);
  });

  it("leaves malformed anchors as literal text", () => {
    expect(parseGuideSegments("[[broken|src/a.ts]]")).toEqual([
      { kind: "text", text: "[[broken|src/a.ts]]" },
    ]);
  });
});

describe("guideAnchorLabel", () => {
  it("renders a single line and a range differently", () => {
    expect(guideAnchorLabel({ filePath: "a", startLine: 4, endLine: 4 })).toBe(":4");
    expect(guideAnchorLabel({ filePath: "a", startLine: 4, endLine: 9 })).toBe(":4–9");
  });
});

describe("normalizeGuideContent", () => {
  it("splits explanations into paragraphs and parses implications", () => {
    const content = normalizeGuideContent({
      chapters: [
        {
          id: "one",
          title: "One",
          explanation: "First para.\n\nSecond [[x|src/a.ts|2-2]] para.",
          implications: ["Watch [[y|src/a.ts|7-7]]."],
          files: ["src/a.ts"],
        },
      ],
      everythingElse: ["src/b.ts"],
    });

    expect(content.chapters[0]?.paragraphs).toHaveLength(2);
    expect(content.chapters[0]?.implications[0]?.[0]).toEqual({ kind: "text", text: "Watch " });
    expect(content.everythingElse).toEqual(["src/b.ts"]);
  });

  it("derives files from a guide saved with the legacy references shape", () => {
    const content = normalizeGuideContent({
      chapters: [
        {
          id: "one",
          title: "One",
          explanation: "Text",
          implications: "Single",
          references: [
            { filePath: "src/a.ts", startLine: 1, endLine: 2 },
            { filePath: "src/a.ts", startLine: 8, endLine: 8 },
            { filePath: "src/b.ts", startLine: 1, endLine: 1 },
          ],
        },
      ],
    });

    expect(content.chapters[0]?.files).toEqual(["src/a.ts", "src/b.ts"]);
    expect(content.chapters[0]?.implications).toHaveLength(1);
  });

  it("tolerates missing or malformed content", () => {
    expect(normalizeGuideContent(null)).toEqual({ chapters: [], everythingElse: [] });
    expect(normalizeGuideContent({ chapters: [{ id: "x" }] }).chapters).toEqual([]);
  });
});
