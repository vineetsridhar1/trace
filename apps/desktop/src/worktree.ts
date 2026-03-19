import path from "path";
import os from "os";
import fs from "fs";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

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
  const baseBranch = `origin/${startBranch ?? defaultBranch}`;
  const targetPath = path.join(os.homedir(), "trace", "sessions", repoId, sessionId);

  // If the worktree directory already exists, reuse it
  if (fs.existsSync(targetPath)) {
    return { workdir: targetPath, branch };
  }

  // Ensure parent directory exists
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });

  // Check if the branch already exists (e.g. worktree was removed but branch remains)
  const branchExists = await execFileAsync(
    "git", ["rev-parse", "--verify", branch],
    { cwd: repoPath },
  ).then(() => true, () => false);

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
