import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock("../lib/urql", () => ({
  client: { query: mocks.query },
}));

import { refreshLinkedCheckoutStatus, useLinkedCheckoutStore } from "./linked-checkout";

const attachedStatus = {
  repoId: "repo-1",
  repoPath: "/repos/trace",
  isAttached: true,
  attachedSessionGroupId: "group-1",
  targetBranch: "trace/spotlight",
  autoSyncEnabled: true,
  currentBranch: "trace/spotlight",
  currentCommitSha: "abc123",
  lastSyncedCommitSha: "abc123",
  lastSyncError: null,
  restoreBranch: "main",
  restoreCommitSha: "def456",
  hasUncommittedChanges: false,
  changedFiles: [],
  changedFilesTotalCount: 0,
  changedFilesTruncated: false,
};

describe("linked checkout status refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useLinkedCheckoutStore.setState({ statusByKey: {}, pendingByKey: {} });
  });

  it("retains the last successful status when a refresh fails", async () => {
    mocks.query.mockReturnValueOnce({
      toPromise: vi.fn().mockResolvedValue({
        data: { linkedCheckoutStatus: attachedStatus },
      }),
    });
    await refreshLinkedCheckoutStatus("repo-1", "group-1", "runtime-1");

    const refreshError = new Error("temporary network timeout");
    mocks.query.mockReturnValueOnce({
      toPromise: vi.fn().mockResolvedValue({ error: refreshError }),
    });

    await expect(refreshLinkedCheckoutStatus("repo-1", "group-1", "runtime-1")).rejects.toBe(
      refreshError,
    );
    expect(useLinkedCheckoutStore.getState().statusByKey["runtime-1:repo-1"]).toEqual(
      attachedStatus,
    );
  });

  it("replaces cached spotlight state after a successful unlink response", async () => {
    useLinkedCheckoutStore.getState().setStatus("runtime-1:repo-1", attachedStatus);
    const unlinkedStatus = {
      ...attachedStatus,
      repoPath: null,
      isAttached: false,
      attachedSessionGroupId: null,
      targetBranch: null,
      autoSyncEnabled: false,
    };
    mocks.query.mockReturnValueOnce({
      toPromise: vi.fn().mockResolvedValue({
        data: { linkedCheckoutStatus: unlinkedStatus },
      }),
    });

    await refreshLinkedCheckoutStatus("repo-1", "group-1", "runtime-1");

    expect(useLinkedCheckoutStore.getState().statusByKey["runtime-1:repo-1"]).toEqual(
      unlinkedStatus,
    );
  });
});
