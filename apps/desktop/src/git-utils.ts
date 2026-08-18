import { execFile } from "child_process";
import { promisify } from "util";

export const GIT_MAX_BUFFER = 5 * 1024 * 1024;
const GIT_COMMAND_TIMEOUT_MS = 30_000;
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

/**
 * Git's lock error is four lines of internals ending in advice to delete a file
 * it does not name in a copyable way. Trace can't resolve the contention — the
 * holder is usually the user's own terminal or editor — so the least it can do is
 * say what to do about it.
 */
export function gitLockErrorMessage(message: string): string | null {
  const match = /Unable to create '([^']+\.lock)': File exists/.exec(message);
  if (!match) return null;
  return (
    `Another Git process is using this repository. Wait for it to finish, or quit other Git tools, ` +
    `then try again. If nothing else is running, delete ${match[1]} and retry.`
  );
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

function explainGitError(message: string): string {
  if (isGitAuthError(message)) return GIT_AUTH_ERROR;
  return gitLockErrorMessage(message) ?? message;
}

export function formatGitError(error: unknown): string {
  if (error instanceof Error) {
    const gitError = error as GitExecError;
    const stderr = gitError.stderr?.trim();
    if (stderr) return explainGitError(stderr);
    const stdout = gitError.stdout?.trim();
    if (stdout) return explainGitError(stdout);
    if (gitError.message.trim()) {
      return explainGitError(gitError.message.trim());
    }
  }
  return explainGitError(String(error));
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
    timeout: GIT_COMMAND_TIMEOUT_MS,
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
