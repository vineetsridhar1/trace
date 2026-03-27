import path from "path";
import os from "os";
import fs from "fs";
import { execFile } from "child_process";
import { promisify } from "util";
import { assertValidCommitSha } from "@trace/shared";
import { installOrRepairRepoHooks } from "./repo-hooks.js";

const execFileAsync = promisify(execFile);

async function refExists(repoPath: string, ref: string): Promise<boolean> {
  return execFileAsync(
    "git", ["rev-parse", "--verify", ref],
    { cwd: repoPath },
  ).then(() => true, () => false);
}

async function resolveBaseBranch(
  repoPath: string,
  startBranch: string | undefined,
  defaultBranch: string,
): Promise<string> {
  const candidate = startBranch ?? defaultBranch;

  // 1. Remote tracking branch (current behavior, works when pushed)
  const remote = `origin/${candidate}`;
  if (await refExists(repoPath, remote)) return remote;

  // 2. Local ref (branch exists locally but was never pushed)
  if (await refExists(repoPath, candidate)) return candidate;

  // 3. Safe fallback to repo's main branch on remote
  return `origin/${defaultBranch}`;
}

export async function createWorktree({
  repoPath,
  repoId,
  sessionId,
  sessionGroupId,
  defaultBranch,
  startBranch,
  checkpointSha,
  gitHooksEnabled,
}: {
  repoPath: string;
  repoId: string;
  sessionId: string;
  /** When set, the worktree and branch are keyed by this ID so all sessions in the group share the same workspace. */
  sessionGroupId?: string;
  defaultBranch: string;
  /** Branch to base the new worktree on (e.g. from the parent session). Falls back to defaultBranch. */
  startBranch?: string;
  /** Commit SHA to restore from instead of branching from origin/{startBranch|defaultBranch}. */
  checkpointSha?: string;
  /** When enabled for the linked repo, install or repair Trace-managed hooks. */
  gitHooksEnabled?: boolean;
}): Promise<{ workdir: string; branch: string }> {
  const worktreeKey = sessionGroupId ?? sessionId;
  const branch = `trace/${worktreeKey}`;
  const targetPath = path.join(os.homedir(), "trace", "sessions", repoId, worktreeKey);

  // If the worktree directory already exists, reuse it
  if (fs.existsSync(targetPath)) {
    return { workdir: targetPath, branch };
  }

  // Ensure parent directory exists
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });

  if (checkpointSha) assertValidCommitSha(checkpointSha);

  // Fetch latest so origin refs are up to date
  if (!checkpointSha) {
    await execFileAsync("git", ["fetch", "origin"], { cwd: repoPath });
  } else {
    // Verify the checkpoint SHA is reachable locally; fetch if not
    const reachable = await execFileAsync("git", ["cat-file", "-t", checkpointSha], { cwd: repoPath })
      .then(() => true)
      .catch(() => false);
    if (!reachable) {
      await execFileAsync("git", ["fetch", "origin"], { cwd: repoPath });
    }
  }

  // Resolve base branch with fallback chain (remote → local → default)
  const baseRef = checkpointSha
    ?? await resolveBaseBranch(repoPath, startBranch, defaultBranch);

  // Check if the branch already exists (e.g. worktree was removed but branch remains)
  const branchExists = await refExists(repoPath, branch);

  if (branchExists) {
    // Reuse existing branch without -b
    await execFileAsync(
      "git",
      ["worktree", "add", targetPath, branch],
      { cwd: repoPath },
    );
  } else {
    await execFileAsync(
      "git",
      ["worktree", "add", "-b", branch, targetPath, baseRef],
      { cwd: repoPath },
    );
  }

  if (gitHooksEnabled) {
    await installOrRepairRepoHooks(targetPath);
  }

  return { workdir: targetPath, branch };
}

export async function removeWorktree({
  repoPath,
  worktreePath,
}: {
  repoPath: string;
  worktreePath: string;
}): Promise<void> {
  await execFileAsync("git", ["worktree", "remove", worktreePath], {
    cwd: repoPath,
  });
}
