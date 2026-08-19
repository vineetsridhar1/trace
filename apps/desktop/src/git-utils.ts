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

/**
 * Git writes checkout/transfer progress to stderr as `\r`-separated segments, so
 * a failure part-way through a large clone or worktree checkout carries
 * thousands of `Updating files: N% (x/y)` frames ahead of the one line that says
 * what went wrong. Every consumer of a git error here is a human-facing message,
 * and none of them want the frames.
 */
const GIT_PROGRESS_LINE = /^(?:remote: )?[A-Za-z][A-Za-z ]+:\s+\d+%.*$/;

/** Keeps the tail: `fatal:` lands at the end of a git error, not the start. */
const GIT_ERROR_MAX_LENGTH = 800;

export function stripGitProgress(message: string): string {
  const kept = message
    .split(/\r\n|\r|\n/)
    .filter((line) => !GIT_PROGRESS_LINE.test(line.trim()))
    .join("\n")
    .trim();
  if (kept.length <= GIT_ERROR_MAX_LENGTH) return kept;
  return `…${kept.slice(kept.length - GIT_ERROR_MAX_LENGTH)}`;
}

/**
 * Git refuses to check a branch out twice, and its own wording ("is already used
 * by worktree at") reads as a Trace bug rather than as a checkout the user can
 * move. Retrying can never clear it, so the message has to name the fix.
 */
export function gitBranchInUseMessage(message: string): string | null {
  const match = /'([^']+)' is already used by worktree at '([^']+)'/.exec(message);
  if (!match) return null;
  return (
    `Branch ${match[1]} is already checked out at ${match[2]}. ` +
    `Switch that checkout to another branch, or move this session to it.`
  );
}

function explainGitError(message: string): string {
  if (isGitAuthError(message)) return GIT_AUTH_ERROR;
  return (
    gitBranchInUseMessage(message) ?? gitLockErrorMessage(message) ?? stripGitProgress(message)
  );
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
