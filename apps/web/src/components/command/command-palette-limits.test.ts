import { describe, expect, it } from "vitest";
import { limitCommandPaletteGroups } from "./command-palette-limits";

describe("limitCommandPaletteGroups", () => {
  it("bounds rendered results while preserving group and item order", () => {
    const groups = [
      { name: "Sessions", items: ["s1", "s2", "s3"] },
      { name: "Repos", items: ["r1", "r2", "r3"] },
      { name: "People", items: ["p1", "p2"] },
    ];

    expect(limitCommandPaletteGroups(groups, 2, 5)).toEqual([
      { name: "Sessions", items: ["s1", "s2"] },
      { name: "Repos", items: ["r1", "r2"] },
      { name: "People", items: ["p1"] },
    ]);
  });
});
