import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, isThemePreference } from "./theme";

describe("theme preference", () => {
  it("defaults to dark", () => {
    expect(DEFAULT_THEME).toBe("dark");
  });

  it("accepts only dark and light values", () => {
    expect(isThemePreference("dark")).toBe(true);
    expect(isThemePreference("light")).toBe(true);
    expect(isThemePreference("system")).toBe(false);
    expect(isThemePreference(null)).toBe(false);
  });
});
