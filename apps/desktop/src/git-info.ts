import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface GitInfo {
  remoteUrl: string;
  defaultBranch: string;
  name: string;
}

export interface GitInfoError {
  error: string;
}

async function resolveCurrentBranch(folderPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["symbolic-ref", "--short", "-q", "HEAD"], {
      cwd: folderPath,
    });
    const branch = stdout.trim();
    return branch || null;
  } catch {
    return null;
  }
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
    const { stdout } = await execFileAsync("git", ["remote", "get-url", "origin"], {
      cwd: folderPath,
    });
    const branch =
      (await resolveCurrentBranch(folderPath)) ?? (await resolveOriginDefaultBranch(folderPath));

    return {
      remoteUrl: stdout.trim(),
      defaultBranch: branch ?? "main",
      name: path.basename(folderPath),
    };
  } catch {
    return { error: "Not a git repository or no remote origin configured." };
  }
}
