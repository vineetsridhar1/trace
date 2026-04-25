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
