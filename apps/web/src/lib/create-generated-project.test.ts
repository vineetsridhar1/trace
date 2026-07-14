import { describe, expect, it } from "vitest";
import { buildGeneratedProjectStartInput } from "./create-quick-session";

describe("buildGeneratedProjectStartInput", () => {
  it("creates a prompt-first repo-less cloud design input", () => {
    expect(buildGeneratedProjectStartInput("design", "  Explore onboarding  ")).toEqual({
      kind: "design",
      hosting: "cloud",
      prompt: "Explore onboarding",
    });
  });
});
