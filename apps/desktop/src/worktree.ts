import path from "path";
import os from "os";
import fs from "fs";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export async function createWorktree({
  repoPath,
  repoName,
  sessionId,
  defaultBranch,
}: {
  repoPath: string;
  repoName: string;
  sessionId: string;
  defaultBranch: string;
}): Promise<{ workdir: string; branch: string }> {
  const shortId = sessionId.slice(0, 8);
  const branch = `trace/${shortId}`;
  const targetPath = path.join(os.homedir(), "trace", "sessions", repoName, sessionId);

  // Ensure parent directory exists
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });

  await execFileAsync(
    "git",
    ["worktree", "add", "-b", branch, targetPath, defaultBranch],
    { cwd: repoPath },
  );

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
