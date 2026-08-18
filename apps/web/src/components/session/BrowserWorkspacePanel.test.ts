import { describe, expect, it } from "vitest";
import { getBranchSyncStatus } from "./BrowserWorkspacePanel";

function makeStatus(
  overrides: Partial<DesktopLinkedCheckoutStatus> = {},
): DesktopLinkedCheckoutStatus {
  return {
    repoId: "repo-1",
    repoPath: "/repo",
    isAttached: true,
    attachedSessionGroupId: "group-1",
    targetBranch: "trace/test",
    autoSyncEnabled: true,
    currentBranch: "trace/test",
    currentCommitSha: "head",
    lastSyncedCommitSha: "head",
    lastSyncError: null,
    restoreBranch: "main",
    restoreCommitSha: "base",
    hasUncommittedChanges: false,
    changedFiles: [],
    changedFilesTotalCount: 0,
    changedFilesTruncated: false,
    ...overrides,
  };
}

describe("getBranchSyncStatus", () => {
  it("reports synced branches as green", () => {
    expect(getBranchSyncStatus(makeStatus(), "group-1", "trace/test")).toBe("synced");
    expect(
      getBranchSyncStatus(makeStatus({ currentBranch: null }), "group-1", "trace/test"),
    ).toBe("synced");
  });

  it("reports a spotlighted branch that has advanced since sync as yellow", () => {
    expect(
      getBranchSyncStatus(makeStatus({ currentCommitSha: "newer" }), "group-1", "trace/test"),
    ).toBe("behind");
  });

  it("reports a different, dirty, or failed Spotlight checkout as out of sync", () => {
    expect(
      getBranchSyncStatus(makeStatus({ hasUncommittedChanges: true }), "group-1", "trace/test"),
    ).toBe("outOfSync");
    expect(getBranchSyncStatus(makeStatus(), "other-group", "trace/test")).toBe("outOfSync");
    expect(
      getBranchSyncStatus(makeStatus({ targetBranch: "trace/other" }), "group-1", "trace/test"),
    ).toBe("outOfSync");
    expect(
      getBranchSyncStatus(makeStatus({ lastSyncError: "conflict" }), "group-1", "trace/test"),
    ).toBe("outOfSync");
  });
});
