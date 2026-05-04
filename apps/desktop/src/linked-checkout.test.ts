import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
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
    getRepoConfig: (repoId: string) => state.repos[repoId] ?? null,
    saveRepoPath: vi.fn(async (repoId: string, localPath: string) => {
      const current = state.repos[repoId];
      const next = {
        path: localPath,
        gitHooksEnabled: current?.gitHooksEnabled ?? false,
        linkedCheckout: current?.linkedCheckout ?? null,
      };
      state.repos[repoId] = next;
      return next;
    }),
    setRepoLinkedCheckout: vi.fn(async (repoId: string, next: LinkedCheckoutConfig | null) => {
      const current = state.repos[repoId];
      if (!current) return null;
      state.repos[repoId] = { ...current, linkedCheckout: next };
      return state.repos[repoId];
    }),
    __state: state,
    __reset: () => {
      for (const key of Object.keys(state.repos)) delete state.repos[key];
    },
  };
});

vi.mock("./repo-hooks.js", () => ({
  installOrRepairRepoHooks: vi.fn(async () => undefined),
}));

import * as config from "./config.js";
import {
  commitLinkedCheckoutChanges,
  getLinkedCheckoutStatus,
  syncLinkedCheckout,
} from "./linked-checkout.js";

const execFileAsync = promisify(execFile);

const configMock = config as unknown as {
  __state: {
    repos: Record<
      string,
      { path: string; gitHooksEnabled: boolean; linkedCheckout: LinkedCheckoutConfig | null }
    >;
  };
  __reset: () => void;
};

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

async function createRepoFixture(): Promise<{
  repoPath: string;
  worktreePath: string;
}> {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "trace-linked-checkout-"));
  const repoPath = path.join(rootDir, "repo");
  const worktreePath = path.join(rootDir, "worktree");

  fs.mkdirSync(repoPath, { recursive: true });
  await git(repoPath, ["init", "-b", "main"]);
  await git(repoPath, ["config", "user.name", "Trace Test"]);
  await git(repoPath, ["config", "user.email", "trace@example.com"]);

  fs.writeFileSync(path.join(repoPath, "app.txt"), "base\n");
  fs.writeFileSync(path.join(repoPath, "notes.txt"), "notes base\n");
  await git(repoPath, ["add", "app.txt", "notes.txt"]);
  await git(repoPath, ["commit", "-m", "initial commit"]);
  await git(repoPath, ["worktree", "add", "-b", "trace/raccoon", worktreePath, "HEAD"]);

  return { repoPath, worktreePath };
}

async function createRepoFixtureWithStaleOrigin(): Promise<{
  repoPath: string;
  latestSha: string;
}> {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "trace-linked-checkout-origin-"));
  const sourcePath = path.join(rootDir, "source");
  const originPath = path.join(rootDir, "origin.git");
  const repoPath = path.join(rootDir, "repo");

  fs.mkdirSync(sourcePath, { recursive: true });
  await git(sourcePath, ["init", "-b", "main"]);
  await git(sourcePath, ["config", "user.name", "Trace Test"]);
  await git(sourcePath, ["config", "user.email", "trace@example.com"]);

  fs.writeFileSync(path.join(sourcePath, "app.txt"), "base\n");
  await git(sourcePath, ["add", "app.txt"]);
  await git(sourcePath, ["commit", "-m", "initial commit"]);
  await git(sourcePath, ["branch", "trace/raccoon"]);

  await git(rootDir, ["clone", "--bare", sourcePath, originPath]);
  await git(rootDir, ["clone", originPath, repoPath]);
  await git(sourcePath, ["remote", "add", "origin", originPath]);

  await git(sourcePath, ["checkout", "trace/raccoon"]);
  fs.writeFileSync(path.join(sourcePath, "app.txt"), "latest remote\n");
  await git(sourcePath, ["add", "app.txt"]);
  await git(sourcePath, ["commit", "-m", "advance trace branch"]);
  const latestSha = await git(sourcePath, ["rev-parse", "HEAD"]);
  await git(sourcePath, ["push", "origin", "trace/raccoon"]);

  return { repoPath, latestSha };
}

async function createRepoFixtureWithNarrowOrigin(): Promise<{
  repoPath: string;
  sourcePath: string;
  traceSha: string;
}> {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "trace-linked-checkout-narrow-origin-"));
  const sourcePath = path.join(rootDir, "source");
  const originPath = path.join(rootDir, "origin.git");
  const repoPath = path.join(rootDir, "repo");

  fs.mkdirSync(sourcePath, { recursive: true });
  await git(sourcePath, ["init", "-b", "main"]);
  await git(sourcePath, ["config", "user.name", "Trace Test"]);
  await git(sourcePath, ["config", "user.email", "trace@example.com"]);

  fs.writeFileSync(path.join(sourcePath, "app.txt"), "base\n");
  await git(sourcePath, ["add", "app.txt"]);
  await git(sourcePath, ["commit", "-m", "initial commit"]);
  await git(sourcePath, ["checkout", "-b", "trace/raccoon"]);
  fs.writeFileSync(path.join(sourcePath, "app.txt"), "trace branch\n");
  await git(sourcePath, ["add", "app.txt"]);
  await git(sourcePath, ["commit", "-m", "trace branch commit"]);
  const traceSha = await git(sourcePath, ["rev-parse", "HEAD"]);
  await git(sourcePath, ["checkout", "main"]);

  await git(rootDir, ["clone", "--bare", sourcePath, originPath]);
  await git(sourcePath, ["remote", "add", "origin", originPath]);
  await git(rootDir, ["clone", "--single-branch", "--branch", "main", originPath, repoPath]);

  return { repoPath, sourcePath, traceSha };
}

async function gitRefExists(cwd: string, ref: string): Promise<boolean> {
  try {
    await git(cwd, ["rev-parse", "--verify", `${ref}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

function seedRepo(repoId: string, repoPath: string): void {
  configMock.__state.repos[repoId] = {
    path: repoPath,
    gitHooksEnabled: false,
    linkedCheckout: null,
  };
}

beforeEach(() => {
  configMock.__reset();
});

describe("linked checkout commit-back", () => {
  it("commits detached root-checkout changes onto the attached Trace worktree branch", async () => {
    const { repoPath, worktreePath } = await createRepoFixture();
    seedRepo("repo-1", repoPath);

    const syncResult = await syncLinkedCheckout({
      repoId: "repo-1",
      sessionGroupId: "group-1",
      branch: "trace/raccoon",
    });
    expect(syncResult.ok).toBe(true);

    fs.writeFileSync(path.join(repoPath, "app.txt"), "from root checkout\n");

    const dirtyStatus = await getLinkedCheckoutStatus("repo-1");
    expect(dirtyStatus.hasUncommittedChanges).toBe(true);

    const result = await commitLinkedCheckoutChanges({
      repoId: "repo-1",
      sessionGroupId: "group-1",
    });

    expect(result.ok).toBe(true);
    expect(result.status.hasUncommittedChanges).toBe(false);
    expect(fs.readFileSync(path.join(worktreePath, "app.txt"), "utf8")).toBe(
      "from root checkout\n",
    );
    expect(fs.readFileSync(path.join(repoPath, "app.txt"), "utf8")).toBe("from root checkout\n");
    expect(await git(repoPath, ["status", "--porcelain", "--untracked-files=all"])).toBe("");
    expect(await git(worktreePath, ["log", "-1", "--pretty=%s"])).toBe(
      "Commit linked checkout changes",
    );
    expect(result.status.currentCommitSha).toBe(await git(worktreePath, ["rev-parse", "HEAD"]));
    expect(result.status.lastSyncedCommitSha).toBe(result.status.currentCommitSha);
  }, 15_000);

  it("refuses to overwrite conflicting live changes already present in the Trace worktree", async () => {
    const { repoPath, worktreePath } = await createRepoFixture();
    seedRepo("repo-1", repoPath);

    const syncResult = await syncLinkedCheckout({
      repoId: "repo-1",
      sessionGroupId: "group-1",
      branch: "trace/raccoon",
    });
    expect(syncResult.ok).toBe(true);

    fs.writeFileSync(path.join(worktreePath, "app.txt"), "from worktree\n");
    fs.writeFileSync(path.join(repoPath, "app.txt"), "from root checkout\n");

    const result = await commitLinkedCheckoutChanges({
      repoId: "repo-1",
      sessionGroupId: "group-1",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("app.txt");
    expect(await git(worktreePath, ["log", "-1", "--pretty=%s"])).toBe("initial commit");
    expect(await git(repoPath, ["status", "--porcelain", "--untracked-files=all"])).not.toBe("");
  }, 15_000);

  it("commits only the imported detached-main paths and preserves unrelated worktree changes", async () => {
    const { repoPath, worktreePath } = await createRepoFixture();
    seedRepo("repo-1", repoPath);

    const syncResult = await syncLinkedCheckout({
      repoId: "repo-1",
      sessionGroupId: "group-1",
      branch: "trace/raccoon",
    });
    expect(syncResult.ok).toBe(true);

    fs.writeFileSync(path.join(repoPath, "app.txt"), "from root checkout\n");
    fs.writeFileSync(path.join(worktreePath, "notes.txt"), "staged worktree change\n");
    await git(worktreePath, ["add", "notes.txt"]);

    const result = await commitLinkedCheckoutChanges({
      repoId: "repo-1",
      sessionGroupId: "group-1",
    });

    expect(result.ok).toBe(true);
    expect(await git(worktreePath, ["diff", "--name-only", "HEAD^", "HEAD"])).toBe("app.txt");
    expect(await git(worktreePath, ["status", "--porcelain", "--untracked-files=all"])).toBe(
      "M  notes.txt",
    );
    expect(fs.readFileSync(path.join(worktreePath, "notes.txt"), "utf8")).toBe(
      "staged worktree change\n",
    );
  }, 15_000);

  it("refuses to flatten staged Trace worktree changes on the same paths", async () => {
    const { repoPath, worktreePath } = await createRepoFixture();
    seedRepo("repo-1", repoPath);

    const syncResult = await syncLinkedCheckout({
      repoId: "repo-1",
      sessionGroupId: "group-1",
      branch: "trace/raccoon",
    });
    expect(syncResult.ok).toBe(true);

    fs.writeFileSync(path.join(worktreePath, "app.txt"), "from staged worktree\n");
    await git(worktreePath, ["add", "app.txt"]);
    fs.writeFileSync(path.join(repoPath, "app.txt"), "from root checkout\n");

    const result = await commitLinkedCheckoutChanges({
      repoId: "repo-1",
      sessionGroupId: "group-1",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("staged changes");
    expect(result.error).toContain("app.txt");
    expect(await git(worktreePath, ["log", "-1", "--pretty=%s"])).toBe("initial commit");
    expect(await git(worktreePath, ["status", "--porcelain", "--untracked-files=all"])).toBe(
      "M  app.txt",
    );
  }, 15_000);

  it("syncs after discarding main-worktree changes when requested", async () => {
    const { repoPath, worktreePath } = await createRepoFixture();
    seedRepo("repo-1", repoPath);

    fs.writeFileSync(path.join(repoPath, "app.txt"), "throw this away\n");
    fs.writeFileSync(path.join(repoPath, "scratch.txt"), "temp\n");

    const result = await syncLinkedCheckout({
      repoId: "repo-1",
      sessionGroupId: "group-1",
      branch: "trace/raccoon",
      conflictStrategy: "discard",
    });

    expect(result.ok).toBe(true);
    expect(fs.readFileSync(path.join(repoPath, "app.txt"), "utf8")).toBe("base\n");
    expect(fs.existsSync(path.join(repoPath, "scratch.txt"))).toBe(false);
    expect(await git(repoPath, ["status", "--porcelain", "--untracked-files=all"])).toBe("");
    expect(result.status.currentCommitSha).toBe(await git(worktreePath, ["rev-parse", "HEAD"]));
  }, 15_000);

  it("fetches origin before resolving the branch for sync", async () => {
    const { repoPath, latestSha } = await createRepoFixtureWithStaleOrigin();
    seedRepo("repo-1", repoPath);

    expect(await git(repoPath, ["rev-parse", "origin/trace/raccoon"])).not.toBe(latestSha);

    const result = await syncLinkedCheckout({
      repoId: "repo-1",
      sessionGroupId: "group-1",
      branch: "trace/raccoon",
    });

    expect(result.ok).toBe(true);
    expect(result.status.currentCommitSha).toBe(latestSha);
    expect(result.status.lastSyncedCommitSha).toBe(latestSha);
    expect(await git(repoPath, ["rev-parse", "origin/trace/raccoon"])).toBe(latestSha);
  }, 15_000);

  it("fetches the target branch when the local origin refspec is narrow", async () => {
    const { repoPath, traceSha } = await createRepoFixtureWithNarrowOrigin();
    seedRepo("repo-1", repoPath);

    expect(await gitRefExists(repoPath, "origin/trace/raccoon")).toBe(false);

    const result = await syncLinkedCheckout({
      repoId: "repo-1",
      sessionGroupId: "group-1",
      branch: "trace/raccoon",
    });

    expect(result.ok).toBe(true);
    expect(result.status.currentCommitSha).toBe(traceSha);
    expect(result.status.lastSyncedCommitSha).toBe(traceSha);
    expect(await git(repoPath, ["rev-parse", "origin/trace/raccoon"])).toBe(traceSha);
  }, 15_000);

  it("does not reuse a stale narrow origin ref after the remote target branch is deleted", async () => {
    const { repoPath, sourcePath } = await createRepoFixtureWithNarrowOrigin();
    seedRepo("repo-1", repoPath);

    const initialResult = await syncLinkedCheckout({
      repoId: "repo-1",
      sessionGroupId: "group-1",
      branch: "trace/raccoon",
    });
    expect(initialResult.ok).toBe(true);
    expect(await gitRefExists(repoPath, "origin/trace/raccoon")).toBe(true);

    await git(sourcePath, ["branch", "-D", "trace/raccoon"]);
    await git(sourcePath, ["push", "origin", ":trace/raccoon"]);

    const result = await syncLinkedCheckout({
      repoId: "repo-1",
      sessionGroupId: "group-1",
      branch: "trace/raccoon",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Branch not found: trace/raccoon");
    expect(await gitRefExists(repoPath, "origin/trace/raccoon")).toBe(false);
  }, 15_000);

  it("continues sync with cached refs when origin fetch fails", async () => {
    const { repoPath, worktreePath } = await createRepoFixture();
    seedRepo("repo-1", repoPath);
    await git(repoPath, ["remote", "add", "origin", path.join(repoPath, "../missing-origin.git")]);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    try {
      const result = await syncLinkedCheckout({
        repoId: "repo-1",
        sessionGroupId: "group-1",
        branch: "trace/raccoon",
      });

      expect(result.ok).toBe(true);
      expect(result.status.autoSyncEnabled).toBe(true);
      expect(result.status.lastSyncError).toBeNull();
      expect(result.status.currentCommitSha).toBe(await git(worktreePath, ["rev-parse", "HEAD"]));
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("origin fetch failed"));
    } finally {
      warnSpy.mockRestore();
    }
  }, 15_000);

  it("returns a structured error code for dirty-root sync failures", async () => {
    const { repoPath } = await createRepoFixture();
    seedRepo("repo-1", repoPath);

    fs.writeFileSync(path.join(repoPath, "app.txt"), "dirty\n");

    const result = await syncLinkedCheckout({
      repoId: "repo-1",
      sessionGroupId: "group-1",
      branch: "trace/raccoon",
    });

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("DIRTY_ROOT_CHECKOUT");
  }, 15_000);

  it("returns a structured error code for untracked files that would be overwritten by sync", async () => {
    const { repoPath, worktreePath } = await createRepoFixture();
    seedRepo("repo-1", repoPath);

    fs.writeFileSync(path.join(worktreePath, "notes.txt"), "tracked in trace branch\n");
    await git(worktreePath, ["add", "notes.txt"]);
    await git(worktreePath, ["commit", "-m", "add tracked notes"]);
    fs.writeFileSync(path.join(repoPath, "notes.txt"), "local untracked file\n");

    const result = await syncLinkedCheckout({
      repoId: "repo-1",
      sessionGroupId: "group-1",
      branch: "trace/raccoon",
    });

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("DIRTY_ROOT_CHECKOUT");
  }, 15_000);

  it("does not pause the attachment when sync stops for conflict resolution", async () => {
    const { repoPath } = await createRepoFixture();
    seedRepo("repo-1", repoPath);

    const syncResult = await syncLinkedCheckout({
      repoId: "repo-1",
      sessionGroupId: "group-1",
      branch: "trace/raccoon",
    });
    expect(syncResult.ok).toBe(true);

    fs.writeFileSync(path.join(repoPath, "app.txt"), "dirty\n");

    const result = await syncLinkedCheckout({
      repoId: "repo-1",
      sessionGroupId: "group-1",
      branch: "trace/raccoon",
    });

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("DIRTY_ROOT_CHECKOUT");
    expect(result.status.autoSyncEnabled).toBe(true);
    expect(result.status.lastSyncError).toBeNull();
  }, 15_000);

  it("commits main-worktree changes onto the Trace worktree during sync", async () => {
    const { repoPath, worktreePath } = await createRepoFixture();
    seedRepo("repo-1", repoPath);

    fs.writeFileSync(path.join(repoPath, "app.txt"), "carry me over\n");

    const result = await syncLinkedCheckout({
      repoId: "repo-1",
      sessionGroupId: "group-1",
      branch: "trace/raccoon",
      conflictStrategy: "commit",
      commitMessage: "Carry local changes into Trace",
    });

    expect(result.ok).toBe(true);
    expect(await git(worktreePath, ["log", "-1", "--pretty=%s"])).toBe(
      "Carry local changes into Trace",
    );
    expect(fs.readFileSync(path.join(worktreePath, "app.txt"), "utf8")).toBe("carry me over\n");
    expect(fs.readFileSync(path.join(repoPath, "app.txt"), "utf8")).toBe("carry me over\n");
    expect(await git(repoPath, ["status", "--porcelain", "--untracked-files=all"])).toBe("");
  }, 15_000);

  it("replays main-worktree changes on top of the synced commit", async () => {
    const { repoPath, worktreePath } = await createRepoFixture();
    seedRepo("repo-1", repoPath);

    fs.writeFileSync(path.join(worktreePath, "notes.txt"), "branch advanced\n");
    await git(worktreePath, ["add", "notes.txt"]);
    await git(worktreePath, ["commit", "-m", "advance trace branch"]);
    fs.writeFileSync(path.join(repoPath, "app.txt"), "keep this local\n");

    const result = await syncLinkedCheckout({
      repoId: "repo-1",
      sessionGroupId: "group-1",
      branch: "trace/raccoon",
      conflictStrategy: "rebase",
    });

    expect(result.ok).toBe(true);
    expect(result.status.currentBranch).toBe(null);
    expect(result.status.currentCommitSha).toBe(await git(worktreePath, ["rev-parse", "HEAD"]));
    expect(result.status.hasUncommittedChanges).toBe(true);
    expect(fs.readFileSync(path.join(repoPath, "app.txt"), "utf8")).toBe("keep this local\n");
    expect(fs.readFileSync(path.join(repoPath, "notes.txt"), "utf8")).toBe("branch advanced\n");
  }, 15_000);

  it("pauses the attachment when rebasing local changes onto the synced commit conflicts", async () => {
    const { repoPath, worktreePath } = await createRepoFixture();
    seedRepo("repo-1", repoPath);

    fs.writeFileSync(path.join(worktreePath, "app.txt"), "branch version\n");
    await git(worktreePath, ["add", "app.txt"]);
    await git(worktreePath, ["commit", "-m", "advance conflicting branch"]);
    fs.writeFileSync(path.join(repoPath, "app.txt"), "local version\n");

    const result = await syncLinkedCheckout({
      repoId: "repo-1",
      sessionGroupId: "group-1",
      branch: "trace/raccoon",
      conflictStrategy: "rebase",
    });

    expect(result.ok).toBe(false);
    expect(result.status.isAttached).toBe(true);
    expect(result.status.autoSyncEnabled).toBe(false);
    expect(result.status.lastSyncError).toBeTruthy();
    expect(result.status.hasUncommittedChanges).toBe(true);
  }, 15_000);

  it("uses a custom commit message when committing attached main-worktree changes", async () => {
    const { repoPath, worktreePath } = await createRepoFixture();
    seedRepo("repo-1", repoPath);

    const syncResult = await syncLinkedCheckout({
      repoId: "repo-1",
      sessionGroupId: "group-1",
      branch: "trace/raccoon",
    });
    expect(syncResult.ok).toBe(true);

    fs.writeFileSync(path.join(repoPath, "app.txt"), "custom message\n");

    const result = await commitLinkedCheckoutChanges({
      repoId: "repo-1",
      sessionGroupId: "group-1",
      message: "Commit with custom message",
    });

    expect(result.ok).toBe(true);
    expect(await git(worktreePath, ["log", "-1", "--pretty=%s"])).toBe(
      "Commit with custom message",
    );
  }, 15_000);
});
