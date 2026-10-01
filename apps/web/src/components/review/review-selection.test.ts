import { describe, expect, it } from "vitest";
import { parsePatch } from "./diff-patch";
import { selectionFromLines, selectionRangeLabel } from "./review-selection";

const lines = parsePatch(
  ["@@ -1,3 +1,5 @@", " const a = 1;", "+const b = 2;", "+const c = 3;", " const d = 4;"].join(
    "\n",
  ),
);

describe("selectionFromLines", () => {
  it("collects the selected text and surrounding context", () => {
    const selection = selectionFromLines("x.ts", lines, { side: "head", start: 2, end: 3 });
    expect(selection?.selectedText).toBe("const b = 2;\nconst c = 3;");
    expect(selection?.context).toContain("const a = 1;");
    expect(selection?.context).toContain("const d = 4;");
  });

  it("returns null when the range matches no line on that side", () => {
    expect(selectionFromLines("x.ts", lines, { side: "base", start: 99, end: 99 })).toBeNull();
  });

  it("keeps the requested range on the selection", () => {
    const selection = selectionFromLines("x.ts", lines, { side: "head", start: 2, end: 2 });
    expect(selection).toMatchObject({ filePath: "x.ts", startLine: 2, endLine: 2, side: "head" });
  });
});

describe("selectionRangeLabel", () => {
  it("collapses a single line", () => {
    expect(selectionRangeLabel({ side: "head", start: 7, end: 7 })).toBe("L7");
    expect(selectionRangeLabel({ side: "head", start: 7, end: 9 })).toBe("L7–9");
  });
});
