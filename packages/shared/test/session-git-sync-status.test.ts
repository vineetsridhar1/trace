import { describe, expect, it } from "vitest";
import {
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
