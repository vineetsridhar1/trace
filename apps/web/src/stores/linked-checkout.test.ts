import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  mutation: vi.fn(),
}));

vi.mock("../lib/urql", () => ({
  client: { query: mocks.query, mutation: mocks.mutation },
}));

import {
  refreshLinkedCheckoutStatus,
  syncLinkedCheckout,
  useLinkedCheckoutStore,
} from "./linked-checkout";

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
    useLinkedCheckoutStore.setState({
      statusByKey: {},
      pendingByKey: {},
      statusRevisionByKey: {},
    });
  });

  it("retains the last successful status when a refresh fails", async () => {
    mocks.query.mockReturnValueOnce({
      toPromise: vi.fn().mockResolvedValue({
        data: { linkedCheckoutStatus: attachedStatus },
      }),
    });
    await refreshLinkedCheckoutStatus("repo-1", "group-1", "runtime-1");

    const refreshError = new Error("temporary replica timeout");
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

  it("does not let an older refresh overwrite a newer successful refresh", async () => {
    let resolveOlder!: (value: { data: { linkedCheckoutStatus: typeof attachedStatus } }) => void;
    mocks.query
      .mockReturnValueOnce({
        toPromise: vi.fn(
          () =>
            new Promise((resolve) => {
              resolveOlder = resolve;
            }),
        ),
      })
      .mockReturnValueOnce({
        toPromise: vi.fn().mockResolvedValue({ data: { linkedCheckoutStatus: attachedStatus } }),
      });

    const older = refreshLinkedCheckoutStatus("repo-1", "group-1", "runtime-1");
    await refreshLinkedCheckoutStatus("repo-1", "group-1", "runtime-1");
    resolveOlder({
      data: {
        linkedCheckoutStatus: {
          ...attachedStatus,
          isAttached: false,
        },
      },
    });
    await older;

    expect(useLinkedCheckoutStore.getState().statusByKey["runtime-1:repo-1"]).toEqual(
      attachedStatus,
    );
  });

  it("does not let an in-flight refresh overwrite a newer mutation status", async () => {
    let resolveRefresh!: (value: { data: { linkedCheckoutStatus: typeof attachedStatus } }) => void;
    mocks.query.mockReturnValueOnce({
      toPromise: vi.fn(
        () =>
          new Promise((resolve) => {
            resolveRefresh = resolve;
          }),
      ),
    });

    const refresh = refreshLinkedCheckoutStatus("repo-1", "group-1", "runtime-1");
    useLinkedCheckoutStore.getState().setStatus("runtime-1:repo-1", attachedStatus);
    resolveRefresh({
      data: {
        linkedCheckoutStatus: {
          ...attachedStatus,
          isAttached: false,
        },
      },
    });
    await refresh;

    expect(useLinkedCheckoutStore.getState().statusByKey["runtime-1:repo-1"]).toEqual(
      attachedStatus,
    );
  });

  it("retains spotlight state when sync and its recovery refresh both fail", async () => {
    useLinkedCheckoutStore.getState().setStatus("runtime-1:repo-1", attachedStatus);
    mocks.mutation.mockReturnValueOnce({
      toPromise: vi.fn().mockResolvedValue({ error: new Error("sync replica unavailable") }),
    });
    mocks.query.mockReturnValueOnce({
      toPromise: vi.fn().mockResolvedValue({ error: new Error("refresh replica unavailable") }),
    });

    const result = await syncLinkedCheckout({
      repoId: "repo-1",
      sessionGroupId: "group-1",
      runtimeInstanceId: "runtime-1",
      branch: "trace/spotlight",
      autoSyncEnabled: true,
    });

    expect(result.ok).toBe(false);
    expect(result.status).toEqual(attachedStatus);
    expect(useLinkedCheckoutStore.getState().statusByKey["runtime-1:repo-1"]).toEqual(
      attachedStatus,
    );
  });
});
