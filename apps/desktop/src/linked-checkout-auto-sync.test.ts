import { beforeEach, describe, expect, it, vi } from "vitest";
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
}));

vi.mock("./runtime-debug.js", () => ({
  runtimeDebug: vi.fn(),
}));

import * as config from "./config.js";
import * as linkedCheckout from "./linked-checkout.js";
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
};

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
    fetch: vi.fn(async () => undefined),
    revParseHead: vi.fn(async () => "a".repeat(40)),
    resolveOriginSha: vi.fn(async () => "a".repeat(40)),
    hasTrackedChanges: vi.fn(async () => false),
    switchDetached: vi.fn(async () => undefined),
    getCurrentBranch: vi.fn(async () => null),
    hasInProgressOperation: vi.fn(async () => false),
    now: () => "2026-04-18T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  configMock.__reset();
  configMock.setRepoLinkedCheckout.mockClear();
  linkedCheckoutMock.pauseExistingAttachment.mockClear();
});

describe("LinkedCheckoutAutoSyncManager", () => {
  it("switches to origin HEAD when branch drifts", async () => {
    seedAttachment("repo-1", { lastSyncedCommitSha: "a".repeat(40) });
    const deps = makeDeps({
      revParseHead: vi.fn(async () => "a".repeat(40)),
      resolveOriginSha: vi.fn(async () => "b".repeat(40)),
    });
    const manager = new LinkedCheckoutAutoSyncManager(15_000, deps);

    await manager.reconcileAll();

    expect(deps.fetch).toHaveBeenCalledWith("/tmp/repo-repo-1", "main");
    expect(deps.switchDetached).toHaveBeenCalledWith("/tmp/repo-repo-1", "b".repeat(40));
    expect(configMock.__state.repos["repo-1"].linkedCheckout).toMatchObject({
      lastSyncedCommitSha: "b".repeat(40),
      lastSyncError: null,
      lastSyncAt: "2026-04-18T00:00:00.000Z",
    });
  });

  it("no-op when HEAD already matches origin and no prior error", async () => {
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

  it("records lastSyncError on transient fetch failure without flipping auto-sync off", async () => {
    seedAttachment("repo-1");
    const transient = Object.assign(new Error("fetch failed"), {
      stderr: "fatal: unable to access 'x': Could not resolve host: github.com",
    });
    const deps = makeDeps({
      fetch: vi.fn(async () => {
        throw transient;
      }),
    });
    const manager = new LinkedCheckoutAutoSyncManager(15_000, deps);

    await manager.reconcileAll();

    const stored = configMock.__state.repos["repo-1"].linkedCheckout;
    expect(stored?.autoSyncEnabled).toBe(true);
    expect(stored?.lastSyncError).toContain("Could not resolve host");
    expect(linkedCheckoutMock.pauseExistingAttachment).not.toHaveBeenCalled();
  });

  it("pauses auto-sync on hard fetch failure", async () => {
    seedAttachment("repo-1");
    const hard = Object.assign(new Error("fetch failed"), {
      stderr: "fatal: refusing to fetch into current branch",
    });
    const deps = makeDeps({
      fetch: vi.fn(async () => {
        throw hard;
      }),
    });
    const manager = new LinkedCheckoutAutoSyncManager(15_000, deps);

    await manager.reconcileAll();

    expect(linkedCheckoutMock.pauseExistingAttachment).toHaveBeenCalledWith(
      "repo-1",
      expect.stringContaining("refusing to fetch"),
    );
    expect(configMock.__state.repos["repo-1"].linkedCheckout?.autoSyncEnabled).toBe(false);
  });

  it("pauses when the root checkout has tracked changes", async () => {
    seedAttachment("repo-1");
    const deps = makeDeps({
      revParseHead: vi.fn(async () => "a".repeat(40)),
      resolveOriginSha: vi.fn(async () => "b".repeat(40)),
      hasTrackedChanges: vi.fn(async () => true),
    });
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
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it("bails silently when a rebase/merge is in progress", async () => {
    seedAttachment("repo-1");
    const deps = makeDeps({
      hasInProgressOperation: vi.fn(async () => true),
    });
    const manager = new LinkedCheckoutAutoSyncManager(15_000, deps);

    await manager.reconcileAll();

    expect(deps.fetch).not.toHaveBeenCalled();
    expect(deps.switchDetached).not.toHaveBeenCalled();
    expect(linkedCheckoutMock.pauseExistingAttachment).not.toHaveBeenCalled();
    expect(configMock.setRepoLinkedCheckout).not.toHaveBeenCalled();
  });

  it("skips repos where autoSyncEnabled is false", async () => {
    seedAttachment("repo-1", { autoSyncEnabled: false });
    const deps = makeDeps();
    const manager = new LinkedCheckoutAutoSyncManager(15_000, deps);

    await manager.reconcileAll();

    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it("reconcile(repoId) runs a single tick for the given repo", async () => {
    seedAttachment("repo-1");
    seedAttachment("repo-2");
    const deps = makeDeps();
    const manager = new LinkedCheckoutAutoSyncManager(15_000, deps);

    await manager.reconcile("repo-1");

    expect(deps.fetch).toHaveBeenCalledTimes(1);
    expect(deps.fetch).toHaveBeenCalledWith("/tmp/repo-repo-1", "main");
  });

  it("rejects unsafe target branch names without shelling out to git", async () => {
    seedAttachment("repo-1", { targetBranch: "--exec=boom" });
    const deps = makeDeps();
    const manager = new LinkedCheckoutAutoSyncManager(15_000, deps);

    await manager.reconcile("repo-1");

    expect(deps.fetch).not.toHaveBeenCalled();
  });
});
