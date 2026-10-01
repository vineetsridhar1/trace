import { describe, expect, it } from "vitest";
import { hunkGapLabel, parsePatch } from "./diff-patch";

const patch = [
  "@@ -1,4 +1,5 @@",
  " const a = 1;",
  "-const b = 2;",
  "+const b = 3;",
  "+const c = 4;",
  " const d = 5;",
  "@@ -20,2 +21,2 @@",
  " const e = 6;",
  "+const f = 7;",
].join("\n");

describe("parsePatch", () => {
  it("numbers added, removed and context lines independently", () => {
    const lines = parsePatch(patch);
    const added = lines.filter((line) => line.kind === "add");
    expect(added.map((line) => line.newLine)).toEqual([2, 3, 22]);
    expect(lines.find((line) => line.kind === "delete")?.oldLine).toBe(2);
  });

  it("records each hunk's range on its meta row", () => {
    const [first] = parsePatch(patch);
    expect(first?.hunk).toEqual({ oldStart: 1, oldCount: 4, newStart: 1, newCount: 5 });
  });

  it("counts the unchanged lines collapsed between hunks", () => {
    const metas = parsePatch(patch).filter((line) => line.kind === "meta");
    expect(metas[0]?.gapLines).toBeUndefined();
    expect(metas[1]?.gapLines).toBe(15);
  });

  it("treats a hunk header without a count as one line", () => {
    const [first] = parsePatch("@@ -7 +7 @@\n-a\n+b");
    expect(first?.hunk).toEqual({ oldStart: 7, oldCount: 1, newStart: 7, newCount: 1 });
  });

  it("ignores file headers so they never render as code", () => {
    const lines = parsePatch("--- a/x.ts\n+++ b/x.ts\n@@ -1,1 +1,1 @@\n+ok");
    expect(lines.filter((line) => line.kind !== "meta").map((line) => line.text)).toEqual(["ok"]);
  });
});

describe("hunkGapLabel", () => {
  it("describes a gap and stays silent for the first hunk", () => {
    const metas = parsePatch(patch).filter((line) => line.kind === "meta");
    expect(hunkGapLabel(metas[0]!)).toBeNull();
    expect(hunkGapLabel(metas[1]!)).toBe("15 unchanged lines");
  });

  it("uses the singular form for one skipped line", () => {
    const metas = parsePatch("@@ -1,1 +1,1 @@\n a\n@@ -3,1 +3,1 @@\n+b").filter(
      (line) => line.kind === "meta",
    );
    expect(hunkGapLabel(metas[1]!)).toBe("1 unchanged line");
  });
});
