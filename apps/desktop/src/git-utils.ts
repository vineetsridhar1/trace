import { execFile } from "child_process";
import { promisify } from "util";

export const GIT_MAX_BUFFER = 5 * 1024 * 1024;
const GIT_AUTH_ERROR =
  "GitHub login required for this repository. Run `gh auth login` or switch the repo remote to SSH, then try again.";

export const execFileAsync = promisify(execFile);

export type GitExecError = Error & {
  stderr?: string;
  stdout?: string;
};

export function gitEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GIT_TERMINAL_PROMPT: "0",
    GIT_ASKPASS: "echo",
    SSH_ASKPASS: "echo",
  };
}

export function isGitAuthError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("could not read username") ||
    normalized.includes("terminal prompts disabled") ||
    normalized.includes("authentication failed") ||
    normalized.includes("repository not found") ||
    normalized.includes("support for password authentication was removed") ||
    normalized.includes("username for 'https://github.com'")
  );
}

export function formatGitError(error: unknown): string {
  if (error instanceof Error) {
    const gitError = error as GitExecError;
    const stderr = gitError.stderr?.trim();
    if (stderr) return isGitAuthError(stderr) ? GIT_AUTH_ERROR : stderr;
    const stdout = gitError.stdout?.trim();
    if (stdout) return isGitAuthError(stdout) ? GIT_AUTH_ERROR : stdout;
    if (gitError.message.trim()) {
      const message = gitError.message.trim();
      return isGitAuthError(message) ? GIT_AUTH_ERROR : message;
    }
  }
  const message = String(error);
  return isGitAuthError(message) ? GIT_AUTH_ERROR : message;
}

export function isSafeGitRef(ref: string): boolean {
  if (!ref || ref.startsWith("-") || ref.includes("..")) return false;
  for (const char of ref) {
    const code = char.charCodeAt(0);
    if (code <= 0x1f || code === 0x7f || /\s/.test(char)) {
      return false;
    }
  }
  return true;
}

export function assertSafeGitRef(ref: string): void {
  if (!isSafeGitRef(ref)) {
    throw new Error(`Unsafe git ref: ${ref}`);
  }
}

export async function runGit(repoPath: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd: repoPath,
    env: gitEnv(),
    maxBuffer: GIT_MAX_BUFFER,
  });
  return stdout.trim();
}

export async function getCurrentBranch(repoPath: string): Promise<string | null> {
  try {
    const branch = await runGit(repoPath, ["symbolic-ref", "--short", "-q", "HEAD"]);
    return branch || null;
  } catch {
    return null;
  }
}
