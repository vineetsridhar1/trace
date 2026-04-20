import {
  assertValidCommitSha,
  type BridgeLinkedCheckoutActionResultPayload,
  type BridgeLinkedCheckoutStatus,
} from "@trace/shared";
import {
  getRepoConfig,
  saveRepoPath,
  setRepoLinkedCheckout,
  type LinkedCheckoutConfig,
} from "./config.js";
import { installOrRepairRepoHooks } from "./repo-hooks.js";
import {
  assertSafeGitRef,
  execFileAsync,
  formatGitError,
  getCurrentBranch,
  GIT_MAX_BUFFER,
  isSafeGitRef,
  runGit,
} from "./git-utils.js";

// Avoids an import cycle with linked-checkout-auto-sync.ts: the auto-sync
// manager imports helpers from this file, so we wire it back in via a setter.
interface AutoSyncManager {
  reconcile(repoId: string): Promise<void>;
}

let autoSyncManager: AutoSyncManager | null = null;

export function setAutoSyncManager(manager: AutoSyncManager | null): void {
  autoSyncManager = manager;
}

function triggerAutoSyncReconcile(repoId: string): void {
  const manager = autoSyncManager;
  if (!manager) return;
  void manager.reconcile(repoId).catch(() => undefined);
}

// Per-repo mutex: serialize git and config mutations for a single root checkout
// so concurrent sync/restore/auto-sync calls can't race on `.git/index.lock` or
// produce interleaved config writes.
const repoLocks = new Map<string, Promise<unknown>>();

export function withRepoLock<T>(repoId: string, fn: () => Promise<T>): Promise<T> {
  const previous = repoLocks.get(repoId) ?? Promise.resolve();
  const next = previous.then(fn, fn);
  const settled = next.catch(() => undefined);
  repoLocks.set(repoId, settled);
  return next.finally(() => {
    if (repoLocks.get(repoId) === settled) {
      repoLocks.delete(repoId);
    }
  });
}

export type LinkedCheckoutStatus = BridgeLinkedCheckoutStatus;

export type LinkedCheckoutActionResult = BridgeLinkedCheckoutActionResultPayload;

export interface SyncLinkedCheckoutInput {
  repoId: string;
  sessionGroupId: string;
  branch: string;
  commitSha?: string | null;
  autoSyncEnabled?: boolean;
}

async function getCurrentCommitSha(repoPath: string): Promise<string> {
  return runGit(repoPath, ["rev-parse", "HEAD"]);
}

async function hasTrackedChanges(repoPath: string): Promise<boolean> {
  const status = await runGit(repoPath, ["status", "--porcelain", "--untracked-files=no"]);
  return status.length > 0;
}

async function refExists(repoPath: string, ref: string): Promise<boolean> {
  assertSafeGitRef(ref);
  return execFileAsync("git", ["rev-parse", "--verify", `${ref}^{commit}`], {
    cwd: repoPath,
    maxBuffer: GIT_MAX_BUFFER,
  }).then(
    () => true,
    () => false,
  );
}

async function resolveRefCommitSha(repoPath: string, ref: string): Promise<string | null> {
  if (!isSafeGitRef(ref)) return null;
  if (!(await refExists(repoPath, ref))) return null;
  return runGit(repoPath, ["rev-parse", `${ref}^{commit}`]);
}

export async function resolveTargetCommitSha(
  repoPath: string,
  branch: string,
  commitSha?: string | null,
): Promise<string> {
  if (commitSha) {
    assertValidCommitSha(commitSha);
    await runGit(repoPath, ["cat-file", "-e", `${commitSha}^{commit}`]);
    return commitSha;
  }

  assertSafeGitRef(branch);
  const localSha = await resolveRefCommitSha(repoPath, branch);
  if (localSha) return localSha;

  const remoteSha = await resolveRefCommitSha(repoPath, `origin/${branch}`);
  if (remoteSha) return remoteSha;

  throw new Error(`Branch not found: ${branch}`);
}

async function switchToDetachedCommit(repoPath: string, commitSha: string): Promise<void> {
  await runGit(repoPath, ["switch", "--detach", commitSha]);
}

async function captureRestorePoint(repoPath: string): Promise<{
  originalBranch: string | null;
  originalCommitSha: string;
}> {
  return {
    originalBranch: await getCurrentBranch(repoPath),
    originalCommitSha: await getCurrentCommitSha(repoPath),
  };
}

function buildStatus(
  repoId: string,
  repoPath: string | null,
  attachment: LinkedCheckoutConfig | null,
  currentBranch: string | null,
  currentCommitSha: string | null,
): LinkedCheckoutStatus {
  return {
    repoId,
    repoPath,
    isAttached: attachment != null,
    attachedSessionGroupId: attachment?.sessionGroupId ?? null,
    targetBranch: attachment?.targetBranch ?? null,
    autoSyncEnabled: attachment?.autoSyncEnabled ?? false,
    currentBranch,
    currentCommitSha,
    lastSyncedCommitSha: attachment?.lastSyncedCommitSha ?? null,
    lastSyncError: attachment?.lastSyncError ?? null,
    restoreBranch: attachment?.originalBranch ?? null,
    restoreCommitSha: attachment?.originalCommitSha ?? null,
  };
}

async function readCurrentGitState(repoPath: string): Promise<{
  currentBranch: string | null;
  currentCommitSha: string | null;
}> {
  try {
    const [currentBranch, currentCommitSha] = await Promise.all([
      getCurrentBranch(repoPath),
      getCurrentCommitSha(repoPath),
    ]);
    return { currentBranch, currentCommitSha };
  } catch {
    return { currentBranch: null, currentCommitSha: null };
  }
}

async function readStatus(repoId: string): Promise<LinkedCheckoutStatus> {
  const repoConfig = getRepoConfig(repoId);
  const repoPath = repoConfig?.path ?? null;
  const attachment = repoConfig?.linkedCheckout ?? null;

  if (!repoPath) {
    return buildStatus(repoId, null, attachment, null, null);
  }

  const { currentBranch, currentCommitSha } = await readCurrentGitState(repoPath);
  return buildStatus(repoId, repoPath, attachment, currentBranch, currentCommitSha);
}

async function actionResult(
  repoId: string,
  ok: boolean,
  error: string | null = null,
): Promise<LinkedCheckoutActionResult> {
  return {
    ok,
    error,
    status: await readStatus(repoId),
  };
}

export async function pauseExistingAttachment(repoId: string, error: string): Promise<void> {
  const repoConfig = getRepoConfig(repoId);
  const attachment = repoConfig?.linkedCheckout;
  if (!attachment) return;

  await setRepoLinkedCheckout(repoId, {
    ...attachment,
    autoSyncEnabled: false,
    lastSyncError: error,
  });
  triggerAutoSyncReconcile(repoId);
}

export async function getLinkedCheckoutStatus(repoId: string): Promise<LinkedCheckoutStatus> {
  return readStatus(repoId);
}

export function linkLinkedCheckoutRepo(
  repoId: string,
  localPath: string,
): Promise<LinkedCheckoutActionResult> {
  return withRepoLock(repoId, async () => {
    try {
      const repoConfig = await saveRepoPath(repoId, localPath);
      if (repoConfig.gitHooksEnabled) {
        await installOrRepairRepoHooks(localPath);
      }
      triggerAutoSyncReconcile(repoId);
      return actionResult(repoId, true);
    } catch (error) {
      return actionResult(repoId, false, formatGitError(error));
    }
  });
}

export function syncLinkedCheckout(
  input: SyncLinkedCheckoutInput,
): Promise<LinkedCheckoutActionResult> {
  return withRepoLock(input.repoId, async () => {
    const repoConfig = getRepoConfig(input.repoId);
    const repoPath = repoConfig?.path;

    if (!repoPath) {
      return actionResult(
        input.repoId,
        false,
        "Link this repo to a local checkout in Trace Desktop before syncing.",
      );
    }

    try {
      if (await hasTrackedChanges(repoPath)) {
        throw new Error(
          "Root checkout has tracked changes. Commit, stash, or discard them before syncing.",
        );
      }

      const existingAttachment = getRepoConfig(input.repoId)?.linkedCheckout ?? null;
      const restorePoint = existingAttachment ?? (await captureRestorePoint(repoPath));
      const targetCommitSha = await resolveTargetCommitSha(repoPath, input.branch, input.commitSha);

      await switchToDetachedCommit(repoPath, targetCommitSha);

      await setRepoLinkedCheckout(input.repoId, {
        sessionGroupId: input.sessionGroupId,
        targetBranch: input.branch,
        autoSyncEnabled: input.autoSyncEnabled ?? true,
        originalBranch: restorePoint.originalBranch,
        originalCommitSha: restorePoint.originalCommitSha,
        lastSyncedCommitSha: targetCommitSha,
        lastSyncError: null,
        lastSyncAt: new Date().toISOString(),
      });
      triggerAutoSyncReconcile(input.repoId);

      return actionResult(input.repoId, true);
    } catch (error) {
      const message = formatGitError(error);
      await pauseExistingAttachment(input.repoId, message);
      return actionResult(input.repoId, false, message);
    }
  });
}

export function restoreLinkedCheckout(repoId: string): Promise<LinkedCheckoutActionResult> {
  return withRepoLock(repoId, async () => {
    const repoConfig = getRepoConfig(repoId);
    const repoPath = repoConfig?.path;
    const attachment = repoConfig?.linkedCheckout;

    if (!repoPath) {
      return actionResult(
        repoId,
        false,
        "Link this repo to a local checkout in Trace Desktop before restoring.",
      );
    }

    if (!attachment) {
      return actionResult(repoId, false, "Root checkout is not attached to a Trace session.");
    }

    try {
      if (await hasTrackedChanges(repoPath)) {
        throw new Error(
          "Root checkout has tracked changes. Commit, stash, or discard them before restoring.",
        );
      }

      const originalBranchCommitSha = attachment.originalBranch
        ? await resolveRefCommitSha(repoPath, attachment.originalBranch)
        : null;

      if (
        attachment.originalBranch &&
        originalBranchCommitSha &&
        originalBranchCommitSha === attachment.originalCommitSha
      ) {
        await runGit(repoPath, ["switch", attachment.originalBranch]);
      } else {
        assertValidCommitSha(attachment.originalCommitSha);
        await switchToDetachedCommit(repoPath, attachment.originalCommitSha);
      }

      await setRepoLinkedCheckout(repoId, null);
      triggerAutoSyncReconcile(repoId);
      return actionResult(repoId, true);
    } catch (error) {
      const message = formatGitError(error);
      await pauseExistingAttachment(repoId, message);
      return actionResult(repoId, false, message);
    }
  });
}

export function setLinkedCheckoutAutoSync(
  repoId: string,
  enabled: boolean,
): Promise<LinkedCheckoutActionResult> {
  return withRepoLock(repoId, async () => {
    const repoConfig = getRepoConfig(repoId);
    const attachment = repoConfig?.linkedCheckout;

    if (!attachment) {
      return actionResult(repoId, false, "Root checkout is not attached to a Trace session.");
    }

    await setRepoLinkedCheckout(repoId, {
      ...attachment,
      autoSyncEnabled: enabled,
      lastSyncError: null,
    });
    triggerAutoSyncReconcile(repoId);

    return actionResult(repoId, true);
  });
}
