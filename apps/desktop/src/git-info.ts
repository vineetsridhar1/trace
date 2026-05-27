import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface GitInfo {
  remoteUrl: string | null;
  defaultBranch: string;
  name: string;
}

export interface GitInfoError {
  error: string;
}

async function resolveOriginDefaultBranch(folderPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"],
      {
        cwd: folderPath,
      },
    );
    const branch = stdout.trim().replace(/^origin\//, "");
    return branch || null;
  } catch {
    return null;
  }
}

export async function getGitInfo(folderPath: string): Promise<GitInfo | GitInfoError> {
  try {
    await execFileAsync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: folderPath });
    const [remoteResult, defaultBranch] = await Promise.all([
      execFileAsync("git", ["remote", "get-url", "origin"], { cwd: folderPath }).catch(
        () => null,
      ),
      resolveOriginDefaultBranch(folderPath),
    ]);

    return {
      remoteUrl: remoteResult?.stdout.trim() || null,
      defaultBranch: defaultBranch ?? "main",
      name: path.basename(folderPath),
    };
  } catch {
    return { error: "Not a git repository." };
  }
}
