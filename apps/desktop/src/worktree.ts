import path from "path";
import os from "os";
import fs from "fs";
import { execFile } from "child_process";
import { promisify } from "util";

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
  defaultBranch,
  startBranch,
}: {
  repoPath: string;
  repoId: string;
  sessionId: string;
  defaultBranch: string;
  /** Branch to base the new worktree on (e.g. from the parent session). Falls back to defaultBranch. */
  startBranch?: string;
}): Promise<{ workdir: string; branch: string }> {
  const branch = `trace/${sessionId}`;
  const targetPath = path.join(os.homedir(), "trace", "sessions", repoId, sessionId);

  // If the worktree directory already exists, reuse it
  if (fs.existsSync(targetPath)) {
    return { workdir: targetPath, branch };
  }

  // Ensure parent directory exists
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });

  // Fetch latest so origin refs are up to date
  await execFileAsync("git", ["fetch", "origin"], { cwd: repoPath });

  // Resolve base branch with fallback chain (remote → local → default)
  const baseBranch = await resolveBaseBranch(repoPath, startBranch, defaultBranch);

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
      ["worktree", "add", "-b", branch, targetPath, baseBranch],
      { cwd: repoPath },
    );
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
