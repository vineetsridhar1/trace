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
  await git(repoPath, ["add", "app.txt"]);
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
});
