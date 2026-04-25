import { execFile } from "child_process";
import { promisify } from "util";

export const GIT_MAX_BUFFER = 5 * 1024 * 1024;

export const execFileAsync = promisify(execFile);

export type GitExecError = Error & {
  stderr?: string;
  stdout?: string;
};

export function formatGitError(error: unknown): string {
  if (error instanceof Error) {
    const gitError = error as GitExecError;
    const stderr = gitError.stderr?.trim();
    if (stderr) return stderr;
    const stdout = gitError.stdout?.trim();
    if (stdout) return stdout;
    if (gitError.message.trim()) return gitError.message.trim();
  }
  return String(error);
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
