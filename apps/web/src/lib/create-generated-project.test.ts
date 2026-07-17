import { describe, expect, it } from "vitest";
import { buildGeneratedProjectStartInput } from "./create-quick-session";

describe("buildGeneratedProjectStartInput", () => {
  it("creates a blank repo-less cloud design input", () => {
    expect(buildGeneratedProjectStartInput("design")).toEqual({
      kind: "design",
      hosting: "cloud",
    });
  });

  it("creates a blank cloud app input", () => {
    expect(buildGeneratedProjectStartInput("app")).toEqual({
      kind: "app",
      hosting: "cloud",
    });
  });
});
