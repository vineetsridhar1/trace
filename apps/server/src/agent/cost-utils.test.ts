import { describe, expect, it } from "vitest";
import { estimateCostCents } from "./cost-utils.js";

describe("estimateCostCents", () => {
  it("uses Claude Haiku 4.5 pricing for the current default model", () => {
    expect(estimateCostCents("claude-haiku-4-5-20251001", 1_000_000, 1_000_000)).toBe(600);
  });

  it("preserves the older generic Haiku fallback pricing", () => {
    expect(estimateCostCents("claude-haiku-3-20240307", 1_000_000, 1_000_000)).toBe(150);
  });
});
