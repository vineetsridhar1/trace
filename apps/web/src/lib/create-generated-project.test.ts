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

  it("keeps app creation prompt-first too", () => {
    expect(buildGeneratedProjectStartInput("app", "Build a CRM")).toEqual({
      kind: "app",
      hosting: "cloud",
      prompt: "Build a CRM",
    });
  });
});
