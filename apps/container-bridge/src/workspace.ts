import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";

const execFileAsync = promisify(execFile);

/**
 * Clone a repo into the working directory for a cloud session.
 * Analogous to desktop's createWorktree() but for fresh clones
 * in an ephemeral container.
 */
export async function cloneRepo({
  remoteUrl,
  defaultBranch,
  branch,
  targetDir,
}: {
  remoteUrl: string;
  defaultBranch: string;
  branch?: string;
  targetDir: string;
}): Promise<{ workdir: string }> {
  // Ensure parent directory exists
  fs.mkdirSync(targetDir, { recursive: true });

  // Clone the repo
  await execFileAsync("git", ["clone", "--branch", defaultBranch, remoteUrl, targetDir]);

  // If a specific branch was requested, create and check it out
  if (branch && branch !== defaultBranch) {
    await execFileAsync("git", ["checkout", "-b", branch], { cwd: targetDir });
  }

  return { workdir: targetDir };
}
