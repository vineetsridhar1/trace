import { describe, expect, it } from "vitest";
import { isCreateListKind } from "./GeneratedProjectsSection";

describe("Create sidebar list", () => {
  it("includes design-system authoring workbenches with generated projects", () => {
    expect(isCreateListKind("design_system")).toBe(true);
    expect(isCreateListKind("design")).toBe(true);
    expect(isCreateListKind("coding")).toBe(false);
  });
});
