import fs from "fs";
import path from "path";
import {
  getRepoConfig,
  readConfig,
  setRepoLinkedCheckout,
  type LinkedCheckoutConfig,
} from "./config.js";
import {
  execFileAsync,
  formatGitError,
  GIT_MAX_BUFFER,
  getCurrentBranch,
  isSafeGitRef,
  runGit,
} from "./git-utils.js";
import {
  pauseExistingAttachment,
  resolveTargetCommitSha,
  withRepoLock,
} from "./linked-checkout.js";
import { runtimeDebug } from "./runtime-debug.js";

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

// Git state directories / files that indicate an in-progress multi-step
// operation we must not interrupt by switching HEAD.
const IN_PROGRESS_MARKERS = [
  "rebase-merge",
  "rebase-apply",
  "MERGE_HEAD",
  "CHERRY_PICK_HEAD",
  "REVERT_HEAD",
  "BISECT_LOG",
];

function isTransientFetchError(message: string): boolean {
  return TRANSIENT_FETCH_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

/**
 * Resolve the real `.git` directory, handling the case where `<repo>/.git` is
 * a file (linked worktrees) that points at the true gitdir. Returns null if
 * anything goes wrong so callers can fail safe.
 */
export async function resolveGitDir(repoPath: string): Promise<string | null> {
  try {
    const gitDir = await runGit(repoPath, ["rev-parse", "--git-dir"]);
    if (!gitDir) return null;
    return path.isAbsolute(gitDir) ? gitDir : path.join(repoPath, gitDir);
  } catch {
    return null;
  }
}

export async function hasInProgressGitOperation(repoPath: string): Promise<boolean> {
  const gitDir = await resolveGitDir(repoPath);
  if (!gitDir) return false;
  return IN_PROGRESS_MARKERS.some((marker) => fs.existsSync(path.join(gitDir, marker)));
}

export interface LinkedCheckoutAutoSyncDeps {
  /** Async git runner. Returns stdout trimmed. Overrideable for tests. */
  fetch: (repoPath: string, branch: string) => Promise<void>;
  revParseHead: (repoPath: string) => Promise<string>;
  hasTrackedChanges: (repoPath: string) => Promise<boolean>;
  switchDetached: (repoPath: string, sha: string) => Promise<void>;
  getCurrentBranch: (repoPath: string) => Promise<string | null>;
  hasInProgressOperation: (repoPath: string) => Promise<boolean>;
  reportStatus: (repoId: string) => Promise<void>;
  now: () => string;
}

const defaultDeps: LinkedCheckoutAutoSyncDeps = {
  fetch: async (repoPath, branch) => {
    await execFileAsync("git", ["fetch", "origin", branch], {
      cwd: repoPath,
      maxBuffer: GIT_MAX_BUFFER,
    });
  },
  revParseHead: (repoPath) => runGit(repoPath, ["rev-parse", "HEAD"]),
  hasTrackedChanges: async (repoPath) => {
    const status = await runGit(repoPath, ["status", "--porcelain", "--untracked-files=no"]);
    return status.length > 0;
  },
  switchDetached: async (repoPath, sha) => {
    await runGit(repoPath, ["switch", "--detach", sha]);
  },
  getCurrentBranch,
  hasInProgressOperation: hasInProgressGitOperation,
  reportStatus: async () => undefined,
  now: () => new Date().toISOString(),
};

async function setLastSyncError(repoId: string, error: string | null): Promise<void> {
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
  private readonly deps: LinkedCheckoutAutoSyncDeps;

  constructor(
    private readonly intervalMs: number,
    deps: Partial<LinkedCheckoutAutoSyncDeps> = {},
  ) {
    this.deps = { ...defaultDeps, ...deps };
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.reconcileAll().catch((error: unknown) => {
        runtimeDebug("auto-sync tick failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private logTick(message: string, data?: Record<string, unknown>): void {
    runtimeDebug(`auto-sync tick ${message}`, data);
  }

  reconcileAll(): Promise<void> {
    if (this.tickInFlight) {
      this.logTick("skipped because another tick is already running");
      return this.tickInFlight;
    }

    const run = (async () => {
      try {
        const config = readConfig();
        const activeRepoIds = Object.entries(config.repos)
          .filter(([, repoConfig]) => repoConfig.linkedCheckout?.autoSyncEnabled)
          .map(([repoId]) => repoId);
        this.logTick("starting reconcileAll", {
          repoCount: Object.keys(config.repos).length,
          activeRepoIds,
        });
        for (const [repoId, repoConfig] of Object.entries(config.repos)) {
          const attachment = repoConfig.linkedCheckout;
          if (!attachment || !attachment.autoSyncEnabled) continue;
          await this.runOneTick(repoId, attachment);
        }
        this.logTick("finished reconcileAll", { activeRepoIds });
      } finally {
        this.tickInFlight = null;
      }
    })();

    this.tickInFlight = run;
    return run;
  }

  async reconcile(repoId: string): Promise<void> {
    const attachment = getRepoConfig(repoId)?.linkedCheckout;
    if (!attachment || !attachment.autoSyncEnabled) {
      this.logTick("skipped single-repo reconcile because auto-sync is disabled", { repoId });
      return;
    }
    await this.runOneTick(repoId, attachment);
  }

  private async runOneTick(repoId: string, attachment: LinkedCheckoutConfig): Promise<void> {
    const repoPath = getRepoConfig(repoId)?.path;
    if (!repoPath) {
      this.logTick("skipped because repo path is missing", { repoId });
      return;
    }

    const targetBranch = attachment.targetBranch;
    if (!isSafeGitRef(targetBranch)) {
      this.logTick("skipped because target branch is unsafe", { repoId, targetBranch });
      return;
    }

    this.logTick("starting", {
      repoId,
      repoPath,
      targetBranch,
      lastSyncedCommitSha: attachment.lastSyncedCommitSha,
      lastSyncError: attachment.lastSyncError,
    });

    await withRepoLock(repoId, async () => {
      const currentAttachment = getRepoConfig(repoId)?.linkedCheckout;
      if (!currentAttachment || !currentAttachment.autoSyncEnabled) {
        this.logTick("skipped after lock because auto-sync is disabled", { repoId });
        return;
      }

      if (await this.deps.hasInProgressOperation(repoPath)) {
        this.logTick("skipped because a git operation is in progress", { repoId, repoPath });
        return;
      }

      let currentBranch: string | null;
      let currentCommitSha: string;
      try {
        currentBranch = await this.deps.getCurrentBranch(repoPath);
        currentCommitSha = await this.deps.revParseHead(repoPath);
      } catch (error) {
        this.logTick("failed reading current git state", {
          repoId,
          error: formatGitError(error),
        });
        await this.pause(repoId, formatGitError(error));
        return;
      }

      this.logTick("read current git state", {
        repoId,
        currentBranch,
        currentCommitSha,
      });

      if (currentBranch !== null) {
        await this.pause(repoId, "Branch changed externally");
        return;
      }

      try {
        this.logTick("fetching target branch", { repoId, targetBranch });
        await this.deps.fetch(repoPath, targetBranch);
      } catch (error) {
        const message = formatGitError(error);
        if (isTransientFetchError(message)) {
          this.logTick("hit transient fetch failure", { repoId, targetBranch, error: message });
          await setLastSyncError(repoId, message);
          await this.deps.reportStatus(repoId);
          return;
        }
        this.logTick("hit hard fetch failure", { repoId, targetBranch, error: message });
        await this.pause(repoId, message);
        return;
      }

      let targetSha: string;
      try {
        targetSha = await resolveTargetCommitSha(repoPath, targetBranch);
      } catch (error) {
        this.logTick("failed resolving target sha", {
          repoId,
          targetBranch,
          error: formatGitError(error),
        });
        await this.pause(repoId, formatGitError(error));
        return;
      }

      this.logTick("resolved target sha", {
        repoId,
        targetBranch,
        currentCommitSha,
        targetSha,
      });

      if (currentCommitSha === targetSha) {
        // Heal stale transient errors when the next tick confirms we're in sync.
        if (currentAttachment.lastSyncError !== null) {
          this.logTick("already in sync and clearing stale sync error", {
            repoId,
            targetSha,
            lastSyncError: currentAttachment.lastSyncError,
          });
          await setLastSyncError(repoId, null);
          await this.deps.reportStatus(repoId);
        } else {
          this.logTick("already in sync", { repoId, targetSha });
        }
        return;
      }

      try {
        if (await this.deps.hasTrackedChanges(repoPath)) {
          this.logTick("pausing because tracked changes are present", {
            repoId,
            currentCommitSha,
            targetSha,
          });
          await this.pause(
            repoId,
            "Root checkout has tracked changes. Commit, stash, or discard them before syncing.",
          );
          return;
        }
      } catch (error) {
        this.logTick("failed checking tracked changes", {
          repoId,
          error: formatGitError(error),
        });
        await this.pause(repoId, formatGitError(error));
        return;
      }

      try {
        this.logTick("switching detached head", { repoId, fromSha: currentCommitSha, targetSha });
        await this.deps.switchDetached(repoPath, targetSha);
      } catch (error) {
        this.logTick("failed switching detached head", {
          repoId,
          targetSha,
          error: formatGitError(error),
        });
        await this.pause(repoId, formatGitError(error));
        return;
      }

      const latest = getRepoConfig(repoId)?.linkedCheckout;
      if (!latest) {
        this.logTick("skipped status write because attachment disappeared", { repoId, targetSha });
        return;
      }

      await setRepoLinkedCheckout(repoId, {
        ...latest,
        lastSyncedCommitSha: targetSha,
        lastSyncError: null,
        lastSyncAt: this.deps.now(),
      });
      runtimeDebug("auto-sync switched linked checkout", {
        repoId,
        targetBranch,
        targetSha,
      });
      await this.deps.reportStatus(repoId);
    });
  }

  private async pause(repoId: string, reason: string): Promise<void> {
    runtimeDebug("auto-sync paused linked checkout", { repoId, reason });
    await pauseExistingAttachment(repoId, reason);
    await this.deps.reportStatus(repoId);
  }
}
