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

  it.each([
    "app/game/[gameId]/page.tsx",
    String.raw`app/game/\[gameId\]/page.tsx`,
    "app/[[...slug]]/page.tsx",
  ])("parses bracketed repository path %s", (filePath) => {
    expect(parseGuideSegments(`[[route|${filePath}|2-8]]`)).toEqual([
      { kind: "anchor", label: "route", anchor: { filePath, startLine: 2, endLine: 8 } },
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

  it("keeps specific steps in order even when they reuse a file", () => {
    const reference = {
      filePath: "src/a.ts",
      startLine: 2,
      endLine: 8,
      title: "Entry",
      explanation: "Start here",
    };
    const content = normalizeGuideContent({
      chapters: [
        { title: "One", references: [reference, { ...reference, startLine: 40, endLine: 50 }] },
        { title: "Two", references: [reference] },
      ],
    });
    expect(content.chapters[0]?.references.map((ref) => ref.startLine)).toEqual([2, 40]);
    expect(content.chapters[1]?.references).toEqual([reference]);
  });

  it("extracts ranges from legacy prose without expanding unreferenced files", () => {
    const content = normalizeGuideContent({
      chapters: [
        {
          title: "Legacy",
          files: ["src/a.ts", "src/b.ts"],
          explanation: "See [[entry|src/a.ts|2-8]].",
        },
      ],
    });
    expect(content.chapters[0]?.references).toEqual([
      {
        filePath: "src/a.ts",
        startLine: 2,
        endLine: 8,
        title: "entry",
        explanation: "See entry (L2–8).",
      },
    ]);
    expect(
      normalizeGuideContent({ chapters: [{ title: "Files only", files: ["src/a.ts"] }] })
        .chapters[0]?.references,
    ).toEqual([]);
  });

  it("keeps the relevant legacy paragraph beside each snippet without inventing context", () => {
    const content = normalizeGuideContent({
      chapters: [
        {
          title: "Flow",
          explanation:
            "[[validate|src/a.ts|2-8]] rejects invalid moves.\n\n[[publish|src/a.ts|40-44]] notifies clients.",
          references: [{ filePath: "src/a.ts", startLine: 2, endLine: 8 }],
        },
      ],
    });
    expect(content.chapters[0]?.references.map((ref) => ref.explanation)).toEqual([
      "validate (L2–8) rejects invalid moves.",
      "publish (L40–44) notifies clients.",
    ]);
  });

  it("does not create unexplained extra snippets from new-format prose links", () => {
    const content = normalizeGuideContent({
      formatVersion: 2,
      chapters: [
        {
          title: "Flow",
          explanation: "Also [[helper|src/b.ts|1-2]].",
          references: [
            {
              filePath: "src/a.ts",
              startLine: 2,
              endLine: 8,
              title: "Validate",
              explanation: "Checks state before moving.",
            },
          ],
        },
      ],
    });
    expect(content.chapters[0]?.references).toHaveLength(1);
    expect(content.chapters[0]?.references[0]?.explanation).toBe("Checks state before moving.");
  });

  it("never expands a legacy whole-file range into a large code card", () => {
    expect(
      normalizeGuideContent({
        chapters: [{ title: "Broad", explanation: "[[all|src/a.ts|1-900]]" }],
      }).chapters[0]?.references,
    ).toEqual([]);
  });

  it("tolerates missing or malformed content", () => {
    expect(normalizeGuideContent(null)).toEqual({ chapters: [], everythingElse: [] });
    expect(normalizeGuideContent({ chapters: [{ id: "x" }] }).chapters).toEqual([]);
  });
});
