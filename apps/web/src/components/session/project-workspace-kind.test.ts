import { describe, expect, it } from "vitest";
import { getProjectWorkspaceKind } from "./project-workspace-kind";

describe("getProjectWorkspaceKind", () => {
  it("routes apps to the embedded preview workspace", () => {
    expect(getProjectWorkspaceKind("app")).toBe("app");
  });

  it("routes designs to the immersive generated workspace", () => {
    expect(getProjectWorkspaceKind("design")).toBe("design");
  });

  it("keeps coding sessions on the standard workspace", () => {
    expect(getProjectWorkspaceKind("coding")).toBeNull();
  });
});
