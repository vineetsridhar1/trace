import { describe, expect, it } from "vitest";
import { usesDefaultApplicationConfig } from "./session-applications-operations";

describe("usesDefaultApplicationConfig", () => {
  it.each(["app", "design", "design_system", "pdf"])(
    "provides application controls for %s workspaces",
    (kind) => {
      expect(usesDefaultApplicationConfig(kind)).toBe(true);
    },
  );

  it("leaves repository-backed sessions on their configured applications", () => {
    expect(usesDefaultApplicationConfig("coding")).toBe(false);
    expect(usesDefaultApplicationConfig(null)).toBe(false);
  });
});
