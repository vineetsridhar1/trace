import { describe, expect, it } from "vitest";
import { buildGeneratedProjectStartInput } from "./create-quick-session";

describe("buildGeneratedProjectStartInput", () => {
  it("creates an empty repo-less cloud design input", () => {
    expect(buildGeneratedProjectStartInput("design")).toEqual({
      kind: "design",
      hosting: "cloud",
      name: "Untitled Design",
    });
  });

  it("retains an optional initial prompt for compatibility", () => {
    expect(buildGeneratedProjectStartInput("design", "  Explore onboarding  ")).toEqual({
      kind: "design",
      hosting: "cloud",
      name: "Untitled Design",
      prompt: "Explore onboarding",
    });
  });
});
