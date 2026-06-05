import { describe, expect, it } from "vitest";
import {
  inspectSessionCurrentBranch,
  inspectSessionGitSyncStatus,
  type GitSyncStatusCommandOptions,
} from "../src/session-git-sync-status.js";

type GitOutput = string | Error;

function createRunner(outputs: Record<string, GitOutput>) {
  const calls: { args: string[]; options?: GitSyncStatusCommandOptions }[] = [];
  const runGit = async (args: string[], options?: GitSyncStatusCommandOptions) => {
    calls.push({ args, options });
    const output = outputs[args.join(" ")];
    if (output instanceof Error) throw output;
    return output ?? "";
  };
  return { runGit, calls };
}

describe("inspectSessionGitSyncStatus", () => {
  it("reports branch, upstream, remote divergence, and clean worktree state", async () => {
    const { runGit } = createRunner({
      "rev-parse HEAD": "head-sha\n",
      "status --porcelain=v1 --untracked-files=no": "",
      "ls-files --others --exclude-standard --directory --no-empty-directory": "",
      "symbolic-ref --short -q HEAD": "trace/test\n",
      "rev-parse --abbrev-ref --symbolic-full-name @{upstream}": "origin/main\n",
      "rev-parse origin/main^{commit}": "main-sha\n",
      "rev-parse origin/trace/test^{commit}": "head-sha\n",
      "rev-list --left-right --count HEAD...origin/main": "1 2\n",
      "rev-list --left-right --count HEAD...origin/trace/test": "0 0\n",
    });

    await expect(inspectSessionGitSyncStatus(runGit)).resolves.toEqual({
      branch: "trace/test",
      headCommitSha: "head-sha",
      upstreamBranch: "origin/main",
      upstreamCommitSha: "main-sha",
      aheadCount: 1,
      behindCount: 2,
      remoteBranch: "origin/trace/test",
      remoteCommitSha: "head-sha",
      remoteAheadCount: 0,
      remoteBehindCount: 0,
      hasUncommittedChanges: false,
    });
  });

  it("treats tracked or untracked output as uncommitted changes", async () => {
    const { runGit } = createRunner({
      "rev-parse HEAD": "head-sha\n",
      "status --porcelain=v1 --untracked-files=no": " M src/file.ts\n",
      "ls-files --others --exclude-standard --directory --no-empty-directory": "notes/\n",
      "symbolic-ref --short -q HEAD": "trace/test\n",
      "rev-parse --abbrev-ref --symbolic-full-name @{upstream}": "origin/trace/test\n",
      "rev-parse origin/trace/test^{commit}": "head-sha\n",
      "rev-list --left-right --count HEAD...origin/trace/test": "0 0\n",
    });

    const status = await inspectSessionGitSyncStatus(runGit);

    expect(status.hasUncommittedChanges).toBe(true);
  });

  it("handles detached HEAD without upstream or remote branch", async () => {
    const { runGit } = createRunner({
      "rev-parse HEAD": "detached-sha\n",
      "status --porcelain=v1 --untracked-files=no": "",
      "ls-files --others --exclude-standard --directory --no-empty-directory": "",
      "symbolic-ref --short -q HEAD": new Error("detached"),
      "rev-parse --abbrev-ref --symbolic-full-name @{upstream}": new Error("no upstream"),
    });

    await expect(inspectSessionGitSyncStatus(runGit)).resolves.toMatchObject({
      branch: null,
      headCommitSha: "detached-sha",
      upstreamBranch: null,
      upstreamCommitSha: null,
      remoteBranch: null,
      remoteCommitSha: null,
      aheadCount: 0,
      behindCount: 0,
      remoteAheadCount: 0,
      remoteBehindCount: 0,
    });
  });

  it("resolves the remote tip from origin when the local tracking ref is missing", async () => {
    const sha = "a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0";
    const { runGit, calls } = createRunner({
      "rev-parse HEAD": `${sha}\n`,
      "status --porcelain=v1 --untracked-files=no": "",
      "ls-files --others --exclude-standard --directory --no-empty-directory": "",
      "symbolic-ref --short -q HEAD": "trace/test\n",
      "rev-parse --abbrev-ref --symbolic-full-name @{upstream}": new Error("no upstream"),
      "rev-parse origin/trace/test^{commit}": new Error("no remote-tracking ref"),
      "ls-remote --heads origin trace/test": `${sha}\trefs/heads/trace/test\n`,
    });

    const status = await inspectSessionGitSyncStatus(runGit);

    expect(status).toMatchObject({
      branch: "trace/test",
      upstreamBranch: null,
      upstreamCommitSha: null,
      remoteBranch: "origin/trace/test",
      remoteCommitSha: sha,
      remoteAheadCount: 0,
      remoteBehindCount: 0,
    });
    expect(calls.some((call) => call.args[0] === "ls-remote")).toBe(true);
  });

  it("reports divergence when origin's tip differs from HEAD", async () => {
    const head = "1111111111111111111111111111111111111111";
    const remote = "2222222222222222222222222222222222222222";
    const { runGit } = createRunner({
      "rev-parse HEAD": `${head}\n`,
      "status --porcelain=v1 --untracked-files=no": "",
      "ls-files --others --exclude-standard --directory --no-empty-directory": "",
      "symbolic-ref --short -q HEAD": "trace/test\n",
      "rev-parse --abbrev-ref --symbolic-full-name @{upstream}": new Error("no upstream"),
      "rev-parse origin/trace/test^{commit}": new Error("no remote-tracking ref"),
      "ls-remote --heads origin trace/test": `${remote}\trefs/heads/trace/test\n`,
    });

    const status = await inspectSessionGitSyncStatus(runGit);

    expect(status.remoteCommitSha).toBe(remote);
    expect(status.remoteAheadCount > 0 || status.remoteBehindCount > 0).toBe(true);
  });

  it("leaves the remote unset when origin has no such branch", async () => {
    const { runGit } = createRunner({
      "rev-parse HEAD": "1111111111111111111111111111111111111111\n",
      "status --porcelain=v1 --untracked-files=no": "",
      "ls-files --others --exclude-standard --directory --no-empty-directory": "",
      "symbolic-ref --short -q HEAD": "trace/test\n",
      "rev-parse --abbrev-ref --symbolic-full-name @{upstream}": new Error("no upstream"),
      "rev-parse origin/trace/test^{commit}": new Error("no remote-tracking ref"),
      "ls-remote --heads origin trace/test": "",
    });

    await expect(inspectSessionGitSyncStatus(runGit)).resolves.toMatchObject({
      branch: "trace/test",
      remoteBranch: null,
      remoteCommitSha: null,
      remoteAheadCount: 0,
      remoteBehindCount: 0,
    });
  });

  it("does not query origin when the local tracking ref exists", async () => {
    const { runGit, calls } = createRunner({
      "rev-parse HEAD": "head-sha\n",
      "status --porcelain=v1 --untracked-files=no": "",
      "ls-files --others --exclude-standard --directory --no-empty-directory": "",
      "symbolic-ref --short -q HEAD": "trace/test\n",
      "rev-parse --abbrev-ref --symbolic-full-name @{upstream}": new Error("no upstream"),
      "rev-parse origin/trace/test^{commit}": "head-sha\n",
      "rev-list --left-right --count HEAD...origin/trace/test": "0 0\n",
    });

    const status = await inspectSessionGitSyncStatus(runGit);

    expect(status.remoteCommitSha).toBe("head-sha");
    expect(calls.some((call) => call.args[0] === "ls-remote")).toBe(false);
  });

  it("passes timeout and buffer limits to git commands", async () => {
    const { runGit, calls } = createRunner({
      "rev-parse HEAD": "head-sha\n",
      "status --porcelain=v1 --untracked-files=no": "",
      "ls-files --others --exclude-standard --directory --no-empty-directory": "",
      "symbolic-ref --short -q HEAD": "trace/test\n",
      "rev-parse --abbrev-ref --symbolic-full-name @{upstream}": "origin/trace/test\n",
      "rev-parse origin/trace/test^{commit}": "head-sha\n",
      "rev-list --left-right --count HEAD...origin/trace/test": "0 0\n",
    });

    await inspectSessionGitSyncStatus(runGit);

    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((call) => call.options?.maxBuffer === 1024 * 1024)).toBe(true);
    expect(calls.every((call) => call.options?.timeoutMs === 10_000)).toBe(true);
  });
});

describe("inspectSessionCurrentBranch", () => {
  it("reads the current branch with a lightweight git command", async () => {
    const { runGit, calls } = createRunner({
      "branch --show-current": "trace/current\n",
    });

    await expect(inspectSessionCurrentBranch(runGit)).resolves.toBe("trace/current");
    expect(calls).toEqual([
      {
        args: ["branch", "--show-current"],
        options: { maxBuffer: 1024 * 1024, timeoutMs: 5_000 },
      },
    ]);
  });

  it("returns null for detached HEAD", async () => {
    const { runGit } = createRunner({
      "branch --show-current": "\n",
    });

    await expect(inspectSessionCurrentBranch(runGit)).resolves.toBeNull();
  });
});
