import { describe, expect, it } from "vitest";
import { buildDesignTokenPatch } from "./DesignTweaksPopover";

describe("buildDesignTokenPatch", () => {
  it("trims and builds CSS-variable token patches", () => {
    expect(buildDesignTokenPatch(" --trace-accent ", " #0f766e ")).toEqual({
      "--trace-accent": "#0f766e",
    });
  });

  it("rejects invalid token names and empty values", () => {
    expect(() => buildDesignTokenPatch("trace-accent", "#0f766e")).toThrow(
      "Token name must be a CSS variable",
    );
    expect(() => buildDesignTokenPatch("--trace-accent", " ")).toThrow("Token value is required.");
  });
});
