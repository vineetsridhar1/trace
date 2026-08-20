import { describe, expect, it } from "vitest";
import { getBrowserSyncIndicator, getBranchSyncStatus } from "./BrowserWorkspacePanel";

describe("getBranchSyncStatus", () => {
  it("reports the current bridge's spotlighted checkout as green", () => {
    expect(getBranchSyncStatus("bridge-1", "bridge-1")).toBe("synced");
  });

  it("reports a branch spotlighted on another bridge as yellow", () => {
    expect(getBranchSyncStatus("bridge-2", "bridge-1")).toBe("behind");
  });

  it("reports an unattached branch as red", () => {
    expect(getBranchSyncStatus(null, "bridge-1")).toBe("outOfSync");
  });
});

describe("getBrowserSyncIndicator", () => {
  it("keeps cloud sessions green without a spotlighted checkout", () => {
    expect(getBrowserSyncIndicator("cloud", "bridge-2", "bridge-1")).toEqual({
      color: "bg-emerald-500",
      label: "Cloud sessions are always synced.",
    });
  });

  it("uses spotlight status for local sessions", () => {
    expect(getBrowserSyncIndicator("local", null, "bridge-1")).toEqual({
      color: "bg-destructive",
      label: "Branch is not spotlighted. Press Spotlight to sync this branch.",
    });
  });
});
