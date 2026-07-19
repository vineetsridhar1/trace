import { describe, expect, it } from "vitest";
import { getSessionEmptyStateContent, isGeneratedProjectKind } from "./sessionEmptyState";

describe("session empty state", () => {
  it("uses an editable App brief instead of immediately sending a suggestion", () => {
    const content = getSessionEmptyStateContent("app");

    expect(content.title).toBe("What should we build?");
    expect(content.description).toContain("paste a reference image");
    expect(content.sendStarterImmediately).toBe(false);
  });

  it("uses Design-specific prompts and copy", () => {
    const content = getSessionEmptyStateContent("design");

    expect(content.title).toBe("What should we design?");
    expect(content.placeholder).toContain("screens, states, or variations");
    expect(content.starterPrompts).toHaveLength(3);
  });

  it("identifies only generated project session kinds", () => {
    expect(isGeneratedProjectKind("app")).toBe(true);
    expect(isGeneratedProjectKind("design")).toBe(true);
    expect(isGeneratedProjectKind("pdf")).toBe(true);
    expect(isGeneratedProjectKind("coding")).toBe(false);
  });
});
