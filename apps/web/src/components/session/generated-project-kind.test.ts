import { describe, expect, it } from "vitest";
import { usesGeneratedProjectWorkspace } from "./generated-project-kind";

describe("usesGeneratedProjectWorkspace", () => {
  it("selects the shared chat and preview workspace for apps and designs only", () => {
    expect(usesGeneratedProjectWorkspace("app")).toBe(true);
    expect(usesGeneratedProjectWorkspace("design")).toBe(true);
    expect(usesGeneratedProjectWorkspace("coding")).toBe(false);
  });
});
