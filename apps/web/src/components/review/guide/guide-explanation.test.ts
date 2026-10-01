import { describe, expect, it } from "vitest";
import { parseGuideExplanation } from "./guide-explanation";
import { normalizeGuideContent } from "./guide-content";

describe("Guide explanation code references", () => {
  it("links local line numbers and ranges to the snippet file", () => {
    const links = parseGuideExplanation(
      "L3 creates state; L5–18 and L20-L22 use it.",
      "lib/store.ts",
    ).filter((part) => part.kind === "anchor");
    expect(links.map((part) => part.anchor)).toEqual([
      { filePath: "lib/store.ts", startLine: 3, endLine: 3 },
      { filePath: "lib/store.ts", startLine: 5, endLine: 18 },
      { filePath: "lib/store.ts", startLine: 20, endLine: 22 },
    ]);
  });
  it("honors explicit paths and parses bracketed route labels", () => {
    const parts = parseGuideExplanation(
      "[[GET /api/game/[gameId]|app/api/game/[gameId]/route.ts|4-44]] calls lib/store.ts:5-18.",
      "other.ts",
    );
    expect(parts.filter((part) => part.kind === "anchor").map((part) => part.anchor)).toEqual([
      { filePath: "app/api/game/[gameId]/route.ts", startLine: 4, endLine: 44 },
      { filePath: "lib/store.ts", startLine: 5, endLine: 18 },
    ]);
    expect(parts[0]).toMatchObject({ label: "GET /api/game/[gameId]" });
  });
  it("keeps each file identity when deriving explanations for older Guides", () => {
    const content = normalizeGuideContent({
      chapters: [
        {
          title: "Flow",
          explanation: "[[store|lib/store.ts|3-3]] is called by [[route|api/route.ts|4-12]].",
        },
      ],
    });
    const explanation = content.chapters[0]!.references[0]!.explanation;
    expect(
      parseGuideExplanation(explanation, "lib/store.ts")
        .filter((part) => part.kind === "anchor")
        .map((part) => part.anchor.filePath),
    ).toEqual(["lib/store.ts", "api/route.ts"]);
  });
  it("leaves invalid or unbounded line mentions as prose", () => {
    expect(parseGuideExplanation("L0 L7–3 L1–1000", "a.ts")).toEqual([
      { kind: "text", text: "L0 L7–3 L1–1000" },
    ]);
  });
});
