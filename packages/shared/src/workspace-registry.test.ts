import { describe, expect, it } from "vitest";
import { WorkspaceRegistry } from "./workspace-registry.js";

describe("WorkspaceRegistry", () => {
  it("makes one group workspace available to every bound sibling", () => {
    const registry = new WorkspaceRegistry();
    registry.bind("session-a", "group-1");
    registry.bind("session-b", "group-1");
    registry.set("session-a", "/workspaces/dolphin");

    expect(registry.get("session-a")).toBe("/workspaces/dolphin");
    expect(registry.get("session-b")).toBe("/workspaces/dolphin");
  });

  it("does not delete a group workspace when one sibling is removed", () => {
    const registry = new WorkspaceRegistry();
    registry.bind("session-a", "group-1");
    registry.bind("session-b", "group-1");
    registry.set("session-a", "/workspaces/dolphin");

    registry.deleteSession("session-a");

    expect(registry.get("session-a")).toBeUndefined();
    expect(registry.get("session-b")).toBe("/workspaces/dolphin");
  });

  it("invalidates a group workspace for every sibling", () => {
    const registry = new WorkspaceRegistry();
    registry.bind("session-a", "group-1");
    registry.bind("session-b", "group-1");
    registry.set("session-a", "/workspaces/dolphin");

    registry.deleteWorkspace("session-b");

    expect(registry.get("session-a")).toBeUndefined();
    expect(registry.get("session-b")).toBeUndefined();
  });

  it("keeps ungrouped session workspaces isolated", () => {
    const registry = new WorkspaceRegistry();
    registry.set("session-a", "/workspaces/a");
    registry.set("session-b", "/workspaces/b");

    expect(registry.get("session-a")).toBe("/workspaces/a");
    expect(registry.get("session-b")).toBe("/workspaces/b");
  });
});
