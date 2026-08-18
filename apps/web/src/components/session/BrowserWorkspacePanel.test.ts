import { describe, expect, it } from "vitest";
import { getBranchSyncStatus } from "./BrowserWorkspacePanel";

function makeStatus(
  overrides: Partial<DesktopSessionGitSyncStatus> = {},
): DesktopSessionGitSyncStatus {
  return {
    branch: "trace/test",
    headCommitSha: "head",
    upstreamBranch: "origin/trace/test",
    upstreamCommitSha: "head",
    aheadCount: 0,
    behindCount: 0,
    remoteBranch: "origin/trace/test",
    remoteCommitSha: "head",
    remoteAheadCount: 0,
    remoteBehindCount: 0,
    hasUncommittedChanges: false,
    ...overrides,
  };
}

describe("getBranchSyncStatus", () => {
  it("reports synced branches as green", () => {
    expect(getBranchSyncStatus(makeStatus())).toBe("synced");
  });

  it("reports a clean branch that is behind origin as yellow", () => {
    expect(getBranchSyncStatus(makeStatus({ remoteBehindCount: 2 }))).toBe("behind");
  });

  it("reports uncommitted, unpushed, and untracked branches as out of sync", () => {
    expect(getBranchSyncStatus(makeStatus({ hasUncommittedChanges: true }))).toBe("outOfSync");
    expect(getBranchSyncStatus(makeStatus({ remoteAheadCount: 1 }))).toBe("outOfSync");
    expect(getBranchSyncStatus(makeStatus({ remoteCommitSha: null }))).toBe("outOfSync");
  });
});
