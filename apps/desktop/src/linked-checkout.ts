import { execFile } from "child_process";
import { promisify } from "util";
import { assertValidCommitSha } from "@trace/shared";
import {
  getRepoConfig,
  setRepoLinkedCheckout,
  type LinkedCheckoutConfig,
} from "./config.js";

const execFileAsync = promisify(execFile);
const GIT_MAX_BUFFER = 5 * 1024 * 1024;

type GitExecError = Error & {
  stderr?: string;
  stdout?: string;
};

export interface LinkedCheckoutStatus {
  repoId: string;
  repoPath: string | null;
  isAttached: boolean;
  attachedSessionGroupId: string | null;
  targetBranch: string | null;
  autoSyncEnabled: boolean;
  currentBranch: string | null;
  currentCommitSha: string | null;
  lastSyncedCommitSha: string | null;
  lastSyncError: string | null;
  restoreBranch: string | null;
  restoreCommitSha: string | null;
}

export interface LinkedCheckoutActionResult {
  ok: boolean;
  status: LinkedCheckoutStatus;
  error: string | null;
}

export interface SyncLinkedCheckoutInput {
  repoId: string;
  sessionGroupId: string;
  branch: string;
  commitSha?: string | null;
  autoSyncEnabled?: boolean;
}

function formatGitError(error: unknown): string {
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

async function getCurrentCommitSha(repoPath: string): Promise<string> {
  return runGit(repoPath, ["rev-parse", "HEAD"]);
}

async function hasTrackedChanges(repoPath: string): Promise<boolean> {
  const status = await runGit(repoPath, ["status", "--porcelain", "--untracked-files=no"]);
  return status.length > 0;
}

async function refExists(repoPath: string, ref: string): Promise<boolean> {
  return execFileAsync("git", ["rev-parse", "--verify", `${ref}^{commit}`], {
    cwd: repoPath,
    maxBuffer: GIT_MAX_BUFFER,
  }).then(
    () => true,
    () => false,
  );
}

async function resolveTargetCommitSha(
  repoPath: string,
  branch: string,
  commitSha?: string | null,
): Promise<string> {
  if (commitSha) {
    assertValidCommitSha(commitSha);
    await runGit(repoPath, ["cat-file", "-e", `${commitSha}^{commit}`]);
    return commitSha;
  }

  return runGit(repoPath, ["rev-parse", `${branch}^{commit}`]);
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

function pauseExistingAttachment(repoId: string, error: string): void {
  const repoConfig = getRepoConfig(repoId);
  const attachment = repoConfig?.linkedCheckout;
  if (!attachment) return;

  setRepoLinkedCheckout(repoId, {
    ...attachment,
    autoSyncEnabled: false,
    lastSyncError: error,
  });
}

export async function getLinkedCheckoutStatus(repoId: string): Promise<LinkedCheckoutStatus> {
  return readStatus(repoId);
}

export async function syncLinkedCheckout(
  input: SyncLinkedCheckoutInput,
): Promise<LinkedCheckoutActionResult> {
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

    setRepoLinkedCheckout(input.repoId, {
      sessionGroupId: input.sessionGroupId,
      targetBranch: input.branch,
      autoSyncEnabled: input.autoSyncEnabled ?? true,
      originalBranch: restorePoint.originalBranch,
      originalCommitSha: restorePoint.originalCommitSha,
      lastSyncedCommitSha: targetCommitSha,
      lastSyncError: null,
      lastSyncAt: new Date().toISOString(),
    });

    return actionResult(input.repoId, true);
  } catch (error) {
    const message = formatGitError(error);
    pauseExistingAttachment(input.repoId, message);
    return actionResult(input.repoId, false, message);
  }
}

export async function restoreLinkedCheckout(
  repoId: string,
): Promise<LinkedCheckoutActionResult> {
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

    if (attachment.originalBranch && (await refExists(repoPath, attachment.originalBranch))) {
      await runGit(repoPath, ["switch", attachment.originalBranch]);
    } else {
      assertValidCommitSha(attachment.originalCommitSha);
      await switchToDetachedCommit(repoPath, attachment.originalCommitSha);
    }

    setRepoLinkedCheckout(repoId, null);
    return actionResult(repoId, true);
  } catch (error) {
    const message = formatGitError(error);
    pauseExistingAttachment(repoId, message);
    return actionResult(repoId, false, message);
  }
}

export async function setLinkedCheckoutAutoSync(
  repoId: string,
  enabled: boolean,
): Promise<LinkedCheckoutActionResult> {
  const repoConfig = getRepoConfig(repoId);
  const attachment = repoConfig?.linkedCheckout;

  if (!attachment) {
    return actionResult(repoId, false, "Root checkout is not attached to a Trace session.");
  }

  setRepoLinkedCheckout(repoId, {
    ...attachment,
    autoSyncEnabled: enabled,
    lastSyncError: null,
  });

  return actionResult(repoId, true);
}
