import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LinkedCheckoutConfig } from "./config.js";

vi.mock("./config.js", () => {
  const state: {
    repos: Record<
      string,
      { path: string; gitHooksEnabled: boolean; linkedCheckout: LinkedCheckoutConfig | null }
    >;
  } = { repos: {} };
  return {
    readConfig: () => ({ repos: { ...state.repos } }),
    getRepoConfig: (repoId: string) => state.repos[repoId] ?? null,
    setRepoLinkedCheckout: vi.fn(async (repoId: string, next: LinkedCheckoutConfig | null) => {
      const current = state.repos[repoId];
      if (!current) return null;
      state.repos[repoId] = { ...current, linkedCheckout: next };
      return state.repos[repoId];
    }),
    // Exposed for tests to seed / inspect state.
    __state: state,
    __reset: () => {
      for (const key of Object.keys(state.repos)) delete state.repos[key];
    },
  };
});

vi.mock("./linked-checkout.js", () => ({
  withRepoLock: async <T>(_repoId: string, fn: () => Promise<T>) => fn(),
  pauseExistingAttachment: vi.fn(async (repoId: string, error: string) => {
    // Mirror the real helper's effect: flip autoSyncEnabled off + record error.
    const config = await import("./config.js");
    const current = config.getRepoConfig(repoId);
    if (!current?.linkedCheckout) return;
    await config.setRepoLinkedCheckout(repoId, {
      ...current.linkedCheckout,
      autoSyncEnabled: false,
      lastSyncError: error,
    });
  }),
  resolveTargetCommitSha: vi.fn(async (_repoPath: string, branch: string) => {
    if (branch === "main") return "a".repeat(40);
    throw new Error(`Branch not found: ${branch}`);
  }),
}));

vi.mock("./runtime-debug.js", () => ({
  runtimeDebug: vi.fn(),
}));

import * as config from "./config.js";
import * as linkedCheckout from "./linked-checkout.js";
import { runtimeDebug } from "./runtime-debug.js";
import {
  LinkedCheckoutAutoSyncManager,
  type LinkedCheckoutAutoSyncDeps,
} from "./linked-checkout-auto-sync.js";

const configMock = config as unknown as {
  __state: {
    repos: Record<
      string,
      { path: string; gitHooksEnabled: boolean; linkedCheckout: LinkedCheckoutConfig | null }
    >;
  };
  __reset: () => void;
  setRepoLinkedCheckout: ReturnType<typeof vi.fn>;
};

const linkedCheckoutMock = linkedCheckout as unknown as {
  pauseExistingAttachment: ReturnType<typeof vi.fn>;
  resolveTargetCommitSha: ReturnType<typeof vi.fn>;
};
const runtimeDebugMock = runtimeDebug as ReturnType<typeof vi.fn>;

function seedAttachment(
  repoId: string,
  overrides: Partial<LinkedCheckoutConfig> = {},
): LinkedCheckoutConfig {
  const attachment: LinkedCheckoutConfig = {
    sessionGroupId: "group-1",
    targetBranch: "main",
    autoSyncEnabled: true,
    originalBranch: "main",
    originalCommitSha: "a".repeat(40),
    lastSyncedCommitSha: "a".repeat(40),
    lastSyncError: null,
    lastSyncAt: null,
    ...overrides,
  };
  configMock.__state.repos[repoId] = {
    path: `/tmp/repo-${repoId}`,
    gitHooksEnabled: false,
    linkedCheckout: attachment,
  };
  return attachment;
}

function makeDeps(overrides: Partial<LinkedCheckoutAutoSyncDeps> = {}): LinkedCheckoutAutoSyncDeps {
  return {
    revParseHead: vi.fn(async () => "a".repeat(40)),
    refreshRemoteRefs: vi.fn(async () => undefined),
    hasTrackedChanges: vi.fn(async () => false),
    switchDetached: vi.fn(async () => undefined),
    getCurrentBranch: vi.fn(async () => null),
    hasInProgressOperation: vi.fn(async () => false),
    now: () => "2026-04-18T00:00:00.000Z",
    ...overrides,
  };
}

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  configMock.__reset();
  configMock.setRepoLinkedCheckout.mockClear();
  linkedCheckoutMock.pauseExistingAttachment.mockClear();
  linkedCheckoutMock.resolveTargetCommitSha.mockClear();
  runtimeDebugMock.mockClear();
  linkedCheckoutMock.resolveTargetCommitSha.mockImplementation(
    async (_repoPath: string, branch: string) => {
      if (branch === "main") return "a".repeat(40);
      throw new Error(`Branch not found: ${branch}`);
    },
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe("LinkedCheckoutAutoSyncManager", () => {
  it("switches to the target branch head when the root checkout drifts", async () => {
    seedAttachment("repo-1", { lastSyncedCommitSha: "a".repeat(40) });
    const deps = makeDeps({
      revParseHead: vi.fn(async () => "a".repeat(40)),
    });
    linkedCheckoutMock.resolveTargetCommitSha.mockResolvedValueOnce("b".repeat(40));
    const manager = new LinkedCheckoutAutoSyncManager(15_000, deps);

    await manager.reconcileAll();

    expect(deps.refreshRemoteRefs).toHaveBeenCalledWith("/tmp/repo-repo-1");
    expect(deps.switchDetached).toHaveBeenCalledWith("/tmp/repo-repo-1", "b".repeat(40));
    expect(configMock.__state.repos["repo-1"].linkedCheckout).toMatchObject({
      lastSyncedCommitSha: "b".repeat(40),
      lastSyncError: null,
      lastSyncAt: "2026-04-18T00:00:00.000Z",
    });
  });

  it("no-op when HEAD already matches the target branch and no prior error", async () => {
    seedAttachment("repo-1");
    const deps = makeDeps();
    const manager = new LinkedCheckoutAutoSyncManager(15_000, deps);

    await manager.reconcileAll();

    expect(deps.switchDetached).not.toHaveBeenCalled();
    expect(configMock.setRepoLinkedCheckout).not.toHaveBeenCalled();
  });

  it("clears stale lastSyncError on successful no-op tick", async () => {
    seedAttachment("repo-1", { lastSyncError: "Could not resolve host" });
    const deps = makeDeps();
    const manager = new LinkedCheckoutAutoSyncManager(15_000, deps);

    await manager.reconcileAll();

    expect(deps.switchDetached).not.toHaveBeenCalled();
    // setLastSyncError writes to config to clear the error.
    expect(configMock.__state.repos["repo-1"].linkedCheckout?.lastSyncError).toBeNull();
  });

  it("pauses when the root checkout has tracked changes", async () => {
    seedAttachment("repo-1");
    const deps = makeDeps({
      revParseHead: vi.fn(async () => "a".repeat(40)),
      hasTrackedChanges: vi.fn(async () => true),
    });
    linkedCheckoutMock.resolveTargetCommitSha.mockResolvedValueOnce("b".repeat(40));
    const manager = new LinkedCheckoutAutoSyncManager(15_000, deps);

    await manager.reconcileAll();

    expect(linkedCheckoutMock.pauseExistingAttachment).toHaveBeenCalledWith(
      "repo-1",
      expect.stringContaining("tracked changes"),
    );
    expect(deps.switchDetached).not.toHaveBeenCalled();
  });

  it("pauses when the user moved the root off detached HEAD", async () => {
    seedAttachment("repo-1");
    const deps = makeDeps({
      getCurrentBranch: vi.fn(async () => "feature/user-branch"),
    });
    const manager = new LinkedCheckoutAutoSyncManager(15_000, deps);

    await manager.reconcileAll();

    expect(linkedCheckoutMock.pauseExistingAttachment).toHaveBeenCalledWith(
      "repo-1",
      "Branch changed externally",
    );
  });

  it("bails silently when a rebase/merge is in progress", async () => {
    seedAttachment("repo-1");
    const deps = makeDeps({
      hasInProgressOperation: vi.fn(async () => true),
    });
    const manager = new LinkedCheckoutAutoSyncManager(15_000, deps);

    await manager.reconcileAll();

    expect(deps.refreshRemoteRefs).not.toHaveBeenCalled();
    expect(deps.switchDetached).not.toHaveBeenCalled();
    expect(linkedCheckoutMock.pauseExistingAttachment).not.toHaveBeenCalled();
    expect(configMock.setRepoLinkedCheckout).not.toHaveBeenCalled();
  });

  it("refreshes origin before resolving the target branch", async () => {
    seedAttachment("repo-1", {
      targetBranch: "trace/rhino",
      lastSyncedCommitSha: "a".repeat(40),
    });
    linkedCheckoutMock.resolveTargetCommitSha.mockImplementation(
      async (_repoPath: string, branch: string) => {
        if (branch === "trace/rhino") return "b".repeat(40);
        throw new Error(`Branch not found: ${branch}`);
      },
    );
    const deps = makeDeps({
      revParseHead: vi.fn(async () => "a".repeat(40)),
    });
    const manager = new LinkedCheckoutAutoSyncManager(15_000, deps);

    await manager.reconcileAll();

    expect(deps.refreshRemoteRefs).toHaveBeenCalledWith("/tmp/repo-repo-1");
    expect(linkedCheckoutMock.resolveTargetCommitSha).toHaveBeenCalledWith(
      "/tmp/repo-repo-1",
      "trace/rhino",
    );
    expect(deps.switchDetached).toHaveBeenCalledWith("/tmp/repo-repo-1", "b".repeat(40));
    expect(configMock.__state.repos["repo-1"].linkedCheckout).toMatchObject({
      lastSyncedCommitSha: "b".repeat(40),
      lastSyncError: null,
      lastSyncAt: "2026-04-18T00:00:00.000Z",
    });
  });

  it("records an error instead of resolving stale refs when refresh fails", async () => {
    seedAttachment("repo-1");
    const deps = makeDeps({
      refreshRemoteRefs: vi.fn(async () => {
        throw new Error("Could not resolve host: github.com");
      }),
    });
    const manager = new LinkedCheckoutAutoSyncManager(15_000, deps);

    await manager.reconcileAll();

    expect(linkedCheckoutMock.resolveTargetCommitSha).not.toHaveBeenCalled();
    expect(deps.switchDetached).not.toHaveBeenCalled();
    expect(configMock.__state.repos["repo-1"].linkedCheckout).toMatchObject({
      autoSyncEnabled: true,
      lastSyncError: "Could not resolve host: github.com",
    });
  });

  it("skips repos where autoSyncEnabled is false", async () => {
    seedAttachment("repo-1", { autoSyncEnabled: false });
    const deps = makeDeps();
    const manager = new LinkedCheckoutAutoSyncManager(15_000, deps);

    await manager.reconcileAll();

    expect(linkedCheckoutMock.resolveTargetCommitSha).not.toHaveBeenCalled();
  });

  it("does not leave the global tick marked in-flight when there are no active repos", async () => {
    seedAttachment("repo-1", { autoSyncEnabled: false });
    const deps = makeDeps();
    const manager = new LinkedCheckoutAutoSyncManager(15_000, deps);

    await manager.reconcileAll();
    await manager.reconcileAll();

    expect(runtimeDebugMock).not.toHaveBeenCalledWith(
      "auto-sync tick skipped because another tick is already running",
      undefined,
    );
  });

  it("reconcile(repoId) runs a single tick for the given repo", async () => {
    seedAttachment("repo-1");
    seedAttachment("repo-2");
    const deps = makeDeps();
    const manager = new LinkedCheckoutAutoSyncManager(15_000, deps);

    await manager.reconcile("repo-1");

    expect(linkedCheckoutMock.resolveTargetCommitSha).toHaveBeenCalledTimes(1);
    expect(linkedCheckoutMock.resolveTargetCommitSha).toHaveBeenCalledWith(
      "/tmp/repo-repo-1",
      "main",
    );
  });

  it("rejects unsafe target branch names without shelling out to git", async () => {
    seedAttachment("repo-1", { targetBranch: "--exec=boom" });
    const deps = makeDeps();
    const manager = new LinkedCheckoutAutoSyncManager(15_000, deps);

    await manager.reconcile("repo-1");

    expect(linkedCheckoutMock.resolveTargetCommitSha).not.toHaveBeenCalled();
  });

  it("start runs immediately and only schedules the next tick after the current one finishes", async () => {
    vi.useFakeTimers();
    seedAttachment("repo-1");
    const resolveGate = createDeferred<string>();
    linkedCheckoutMock.resolveTargetCommitSha.mockImplementation(
      async (_repoPath: string, branch: string) => {
        if (branch !== "main") throw new Error(`Branch not found: ${branch}`);
        return resolveGate.promise;
      },
    );
    const deps = makeDeps({
      revParseHead: vi.fn(async () => "b".repeat(40)),
    });
    const manager = new LinkedCheckoutAutoSyncManager(15_000, deps);

    manager.start();

    await vi.waitFor(() => {
      expect(linkedCheckoutMock.resolveTargetCommitSha).toHaveBeenCalledTimes(1);
    });

    await vi.advanceTimersByTimeAsync(15_000);
    expect(linkedCheckoutMock.resolveTargetCommitSha).toHaveBeenCalledTimes(1);

    resolveGate.resolve("a".repeat(40));
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(15_000);

    expect(linkedCheckoutMock.resolveTargetCommitSha).toHaveBeenCalledTimes(2);
  });

  it("stop prevents rescheduling after an in-flight tick completes", async () => {
    vi.useFakeTimers();
    seedAttachment("repo-1");
    const resolveGate = createDeferred<string>();
    linkedCheckoutMock.resolveTargetCommitSha.mockImplementation(
      async (_repoPath: string, branch: string) => {
        if (branch !== "main") throw new Error(`Branch not found: ${branch}`);
        return resolveGate.promise;
      },
    );
    const deps = makeDeps();
    const manager = new LinkedCheckoutAutoSyncManager(15_000, deps);

    manager.start();

    await vi.waitFor(() => {
      expect(linkedCheckoutMock.resolveTargetCommitSha).toHaveBeenCalledTimes(1);
    });

    manager.stop();
    resolveGate.resolve("a".repeat(40));
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(30_000);

    expect(linkedCheckoutMock.resolveTargetCommitSha).toHaveBeenCalledTimes(1);
  });
});
