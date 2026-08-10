import { describe, expect, it } from "vitest";
import { getProjectWorkspaceKind, usesFloatingProjectChat } from "./project-workspace-kind";

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

describe("usesFloatingProjectChat", () => {
  it("keeps app chat fixed beside the preview", () => {
    expect(usesFloatingProjectChat("app")).toBe(false);
  });

  it.each(["design", "design_system", "pdf", "animation"] as const)(
    "keeps floating chat for %s sessions",
    (kind) => {
      expect(usesFloatingProjectChat(kind)).toBe(true);
    },
  );

  it("does not opt standard sessions into floating chat", () => {
    expect(usesFloatingProjectChat(null)).toBe(false);
  });
});
