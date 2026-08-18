import { describe, expect, it } from "vitest";
import { getBranchSyncStatus } from "./BrowserWorkspacePanel";

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
