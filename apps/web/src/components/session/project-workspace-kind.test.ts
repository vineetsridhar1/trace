import { describe, expect, it } from "vitest";
import { getProjectWorkspaceKind } from "./project-workspace-kind";

describe("getProjectWorkspaceKind", () => {
  it.each(["app", "design", "design_system", "pdf", "animation"] as const)(
    "routes %s sessions to the canvas workspace",
    (kind) => {
      expect(getProjectWorkspaceKind(kind)).toBe(kind);
    },
  );

  it("keeps coding sessions on the standard workspace", () => {
    expect(getProjectWorkspaceKind("coding")).toBeNull();
  });
});
