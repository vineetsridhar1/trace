import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import {
  getRepoConfig,
  readConfig,
  setRepoLinkedCheckout,
  type LinkedCheckoutConfig,
} from "./config.js";
import { pauseExistingAttachment, withRepoLock } from "./linked-checkout.js";

const execFileAsync = promisify(execFile);
const GIT_MAX_BUFFER = 5 * 1024 * 1024;

// Match stderr fragments from git fetch that indicate transient network
// conditions — recoverable by retrying the next tick without flipping
// autoSyncEnabled off.
const TRANSIENT_FETCH_ERROR_PATTERNS: RegExp[] = [
  /Could not resolve host/i,
  /Connection refused/i,
  /Operation timed out/i,
  /Connection timed out/i,
  /Network is unreachable/i,
  /Temporary failure in name resolution/i,
];

type GitExecError = Error & {
  stderr?: string;
  stdout?: string;
};

function formatGitStderr(error: unknown): string {
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

function isTransientFetchError(message: string): boolean {
  return TRANSIENT_FETCH_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

function isSafeGitRef(ref: string): boolean {
  return !!ref && !ref.startsWith("-") && !ref.includes("..") && !/[\x00-\x1f\x7f\s]/.test(ref);
}

function hasActiveRebaseOrMerge(repoPath: string): boolean {
  const gitDir = path.join(repoPath, ".git");
  return (
    fs.existsSync(path.join(gitDir, "rebase-merge")) ||
    fs.existsSync(path.join(gitDir, "rebase-apply")) ||
    fs.existsSync(path.join(gitDir, "MERGE_HEAD"))
  );
}

async function runGit(repoPath: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd: repoPath,
    maxBuffer: GIT_MAX_BUFFER,
  });
  return stdout.trim();
}

async function getCurrentBranch(repoPath: string): Promise<string | null> {
  try {
    const branch = await runGit(repoPath, ["symbolic-ref", "--short", "-q", "HEAD"]);
    return branch || null;
  } catch {
    return null;
  }
}

async function setLastSyncError(repoId: string, error: string): Promise<void> {
  const attachment = getRepoConfig(repoId)?.linkedCheckout;
  if (!attachment) return;
  if (attachment.lastSyncError === error) return;

  await setRepoLinkedCheckout(repoId, {
    ...attachment,
    lastSyncError: error,
  });
}

export class LinkedCheckoutAutoSyncManager {
  private timer: ReturnType<typeof setInterval> | null = null;
  private tickInFlight: Promise<void> | null = null;

  constructor(private readonly intervalMs: number) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  reconcileAll(): Promise<void> {
    return this.tick();
  }

  async reconcile(repoId: string): Promise<void> {
    const attachment = getRepoConfig(repoId)?.linkedCheckout;
    if (!attachment || !attachment.autoSyncEnabled) return;
    await this.runOneTick(repoId, attachment);
  }

  private tick(): Promise<void> {
    if (this.tickInFlight) return this.tickInFlight;

    const run = (async () => {
      try {
        const config = readConfig();
        for (const [repoId, repoConfig] of Object.entries(config.repos)) {
          const attachment = repoConfig.linkedCheckout;
          if (!attachment || !attachment.autoSyncEnabled) continue;
          await this.runOneTick(repoId, attachment);
        }
      } finally {
        this.tickInFlight = null;
      }
    })();

    this.tickInFlight = run;
    return run;
  }

  private async runOneTick(repoId: string, attachment: LinkedCheckoutConfig): Promise<void> {
    const repoPath = getRepoConfig(repoId)?.path;
    if (!repoPath) return;

    const targetBranch = attachment.targetBranch;
    if (!isSafeGitRef(targetBranch)) return;

    await withRepoLock(repoId, async () => {
      const currentAttachment = getRepoConfig(repoId)?.linkedCheckout;
      if (!currentAttachment || !currentAttachment.autoSyncEnabled) return;

      if (hasActiveRebaseOrMerge(repoPath)) return;

      let currentBranch: string | null;
      let currentCommitSha: string;
      try {
        currentBranch = await getCurrentBranch(repoPath);
        currentCommitSha = await runGit(repoPath, ["rev-parse", "HEAD"]);
      } catch (error) {
        await pauseExistingAttachment(repoId, formatGitStderr(error));
        return;
      }

      if (currentBranch !== null) {
        await pauseExistingAttachment(repoId, "Branch changed externally");
        return;
      }

      try {
        await execFileAsync("git", ["fetch", "origin", targetBranch], {
          cwd: repoPath,
          maxBuffer: GIT_MAX_BUFFER,
        });
      } catch (error) {
        const message = formatGitStderr(error);
        if (isTransientFetchError(message)) {
          await setLastSyncError(repoId, message);
          return;
        }
        await pauseExistingAttachment(repoId, message);
        return;
      }

      let targetSha: string;
      try {
        targetSha = await runGit(repoPath, ["rev-parse", `origin/${targetBranch}^{commit}`]);
      } catch (error) {
        await pauseExistingAttachment(repoId, formatGitStderr(error));
        return;
      }

      if (currentCommitSha === targetSha) return;

      try {
        const statusOutput = await runGit(repoPath, [
          "status",
          "--porcelain",
          "--untracked-files=no",
        ]);
        if (statusOutput.length > 0) {
          await pauseExistingAttachment(
            repoId,
            "Root checkout has tracked changes. Commit, stash, or discard them before syncing.",
          );
          return;
        }
      } catch (error) {
        await pauseExistingAttachment(repoId, formatGitStderr(error));
        return;
      }

      try {
        await runGit(repoPath, ["switch", "--detach", targetSha]);
      } catch (error) {
        await pauseExistingAttachment(repoId, formatGitStderr(error));
        return;
      }

      const latest = getRepoConfig(repoId)?.linkedCheckout;
      if (!latest) return;

      await setRepoLinkedCheckout(repoId, {
        ...latest,
        lastSyncedCommitSha: targetSha,
        lastSyncError: null,
        lastSyncAt: new Date().toISOString(),
      });
    });
  }
}
