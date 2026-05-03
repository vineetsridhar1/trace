import fs from "fs";
import path from "path";
import {
  assertValidCommitSha,
  type BridgeLinkedCheckoutActionResultPayload,
  type BridgeLinkedCheckoutErrorCode,
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
  conflictStrategy?: "discard" | "commit" | "rebase" | null;
  commitMessage?: string | null;
}

export interface CommitLinkedCheckoutChangesInput {
  repoId: string;
  sessionGroupId: string;
  message?: string | null;
}

class LinkedCheckoutError extends Error {
  readonly errorCode: BridgeLinkedCheckoutErrorCode;

  constructor(message: string, errorCode: BridgeLinkedCheckoutErrorCode) {
    super(message);
    this.name = "LinkedCheckoutError";
    this.errorCode = errorCode;
  }
}

type CheckoutEntry =
  | {
      kind: "file";
      content: Buffer;
      mode: number;
    }
  | {
      kind: "symlink";
      target: string;
    }
  | null;

interface ChangedPathState {
  path: string;
  headEntry: CheckoutEntry;
  rootEntry: CheckoutEntry;
}

const LINKED_CHECKOUT_COMMIT_MESSAGE = "Commit linked checkout changes";
const LINKED_CHECKOUT_REBASE_STASH_MESSAGE = "Trace linked checkout rebase";

async function getCurrentCommitSha(repoPath: string): Promise<string> {
  return runGit(repoPath, ["rev-parse", "HEAD"]);
}

async function hasTrackedChanges(repoPath: string): Promise<boolean> {
  const status = await runGit(repoPath, ["status", "--porcelain", "--untracked-files=no"]);
  return status.length > 0;
}

async function listUntrackedPaths(repoPath: string): Promise<string[]> {
  const { stdout } = await execFileAsync(
    "git",
    ["ls-files", "--others", "--exclude-standard", "-z"],
    {
      cwd: repoPath,
      maxBuffer: GIT_MAX_BUFFER,
    },
  );
  return parseNullSeparated(stdout);
}

async function hasUncommittedChanges(repoPath: string): Promise<boolean> {
  const status = await runGit(repoPath, ["status", "--porcelain", "--untracked-files=all"]);
  return status.length > 0;
}

function resolveCommitMessage(message?: string | null): string {
  const trimmed = message?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : LINKED_CHECKOUT_COMMIT_MESSAGE;
}

function parseNullSeparated(output: string): string[] {
  return output.split("\0").filter((value) => value.length > 0);
}

async function listChangedPaths(repoPath: string): Promise<string[]> {
  const [{ stdout: trackedStdout }, { stdout: untrackedStdout }] = await Promise.all([
    execFileAsync("git", ["diff", "--name-only", "-z", "--no-renames", "HEAD"], {
      cwd: repoPath,
      maxBuffer: GIT_MAX_BUFFER,
    }),
    execFileAsync("git", ["ls-files", "--others", "--exclude-standard", "-z"], {
      cwd: repoPath,
      maxBuffer: GIT_MAX_BUFFER,
    }),
  ]);

  return [
    ...new Set([...parseNullSeparated(trackedStdout), ...parseNullSeparated(untrackedStdout)]),
  ];
}

async function discardAllChanges(repoPath: string): Promise<void> {
  await runGit(repoPath, ["reset", "--hard", "HEAD"]);
  await runGit(repoPath, ["clean", "-fd"]);
}

async function stashAllChanges(repoPath: string): Promise<boolean> {
  const before = await hasUncommittedChanges(repoPath);
  if (!before) return false;

  await execFileAsync(
    "git",
    ["stash", "push", "--include-untracked", "--message", LINKED_CHECKOUT_REBASE_STASH_MESSAGE],
    {
      cwd: repoPath,
      maxBuffer: GIT_MAX_BUFFER,
    },
  );

  return true;
}

async function popStashedChanges(repoPath: string): Promise<void> {
  await execFileAsync("git", ["stash", "pop", "--index"], {
    cwd: repoPath,
    maxBuffer: GIT_MAX_BUFFER,
  });
}

async function listStagedPaths(repoPath: string): Promise<string[]> {
  const { stdout } = await execFileAsync("git", ["diff", "--name-only", "-z", "--cached", "HEAD"], {
    cwd: repoPath,
    maxBuffer: GIT_MAX_BUFFER,
  });
  return parseNullSeparated(stdout);
}

async function hasUncommittedChangesForPaths(
  repoPath: string,
  changedPaths: string[],
): Promise<boolean> {
  if (changedPaths.length === 0) return false;
  const { stdout } = await execFileAsync(
    "git",
    ["status", "--porcelain", "--untracked-files=all", "--", ...changedPaths],
    {
      cwd: repoPath,
      maxBuffer: GIT_MAX_BUFFER,
    },
  );
  return stdout.length > 0;
}

function previewPaths(paths: string[]): string {
  const preview = paths.slice(0, 5).join(", ");
  return `${preview}${paths.length > 5 ? "..." : ""}`;
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

async function fetchOriginIfAvailable(repoPath: string): Promise<void> {
  try {
    await runGit(repoPath, ["remote", "get-url", "origin"]);
  } catch {
    return;
  }

  await execFileAsync("git", ["fetch", "origin", "--prune"], {
    cwd: repoPath,
    maxBuffer: GIT_MAX_BUFFER,
  });
}

async function listTreePaths(repoPath: string, ref: string): Promise<string[]> {
  const { stdout } = await execFileAsync("git", ["ls-tree", "-r", "-z", "--name-only", ref], {
    cwd: repoPath,
    maxBuffer: GIT_MAX_BUFFER,
  });
  return parseNullSeparated(stdout);
}

async function hasConflictingUntrackedPaths(
  repoPath: string,
  targetCommitSha: string,
): Promise<boolean> {
  const untrackedPaths = await listUntrackedPaths(repoPath);
  if (untrackedPaths.length === 0) return false;

  const targetPaths = await listTreePaths(repoPath, targetCommitSha);
  if (targetPaths.length === 0) return false;

  return untrackedPaths.some((untrackedPath) =>
    targetPaths.some(
      (targetPath) =>
        targetPath === untrackedPath ||
        targetPath.startsWith(`${untrackedPath}/`) ||
        untrackedPath.startsWith(`${targetPath}/`),
    ),
  );
}

async function requiresSyncConflictResolution(
  repoPath: string,
  targetCommitSha: string,
): Promise<boolean> {
  if (await hasTrackedChanges(repoPath)) return true;
  return hasConflictingUntrackedPaths(repoPath, targetCommitSha);
}

async function isAncestorCommit(
  repoPath: string,
  ancestorSha: string,
  descendantSha: string,
): Promise<boolean> {
  assertValidCommitSha(ancestorSha);
  assertValidCommitSha(descendantSha);
  return execFileAsync("git", ["merge-base", "--is-ancestor", ancestorSha, descendantSha], {
    cwd: repoPath,
    maxBuffer: GIT_MAX_BUFFER,
  }).then(
    () => true,
    (error: unknown) => {
      const code =
        typeof error === "object" && error !== null ? (error as { code?: unknown }).code : null;
      if (code === 1) return false;
      throw error;
    },
  );
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
  const remoteSha = await resolveRefCommitSha(repoPath, `origin/${branch}`);

  if (localSha && remoteSha) {
    if (localSha === remoteSha) return localSha;
    if (await isAncestorCommit(repoPath, localSha, remoteSha)) return remoteSha;
    if (await isAncestorCommit(repoPath, remoteSha, localSha)) return localSha;
    throw new Error(`Local and remote refs diverged for branch: ${branch}`);
  }

  if (localSha) return localSha;
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

function entriesEqual(left: CheckoutEntry, right: CheckoutEntry): boolean {
  if (left === null || right === null) return left === right;
  if (left.kind !== right.kind) return false;

  if (left.kind === "symlink" && right.kind === "symlink") {
    return left.target === right.target;
  }

  if (left.kind === "file" && right.kind === "file") {
    return left.mode === right.mode && left.content.equals(right.content);
  }

  return false;
}

function readLocalEntry(absPath: string): CheckoutEntry {
  if (!fs.existsSync(absPath)) return null;

  const stat = fs.lstatSync(absPath);
  if (stat.isSymbolicLink()) {
    return {
      kind: "symlink",
      target: fs.readlinkSync(absPath),
    };
  }
  if (stat.isFile()) {
    return {
      kind: "file",
      content: fs.readFileSync(absPath),
      mode: stat.mode & 0o777,
    };
  }

  throw new Error(`Unsupported filesystem entry type at ${absPath}`);
}

async function readHeadEntry(repoPath: string, relativePath: string): Promise<CheckoutEntry> {
  const { stdout: lsTreeStdout } = await execFileAsync(
    "git",
    ["ls-tree", "-z", "--full-tree", "HEAD", "--", relativePath],
    {
      cwd: repoPath,
      maxBuffer: GIT_MAX_BUFFER,
    },
  );
  const entry = parseNullSeparated(lsTreeStdout)[0];
  if (!entry) return null;

  const [meta] = entry.split("\t");
  const [mode, type, objectSha] = meta.split(" ");
  if (type !== "blob") {
    throw new Error(`Unsupported git entry type at ${relativePath}: ${type}`);
  }

  const { stdout: blobStdout } = await execFileAsync("git", ["cat-file", "blob", objectSha], {
    cwd: repoPath,
    maxBuffer: GIT_MAX_BUFFER,
    encoding: "buffer",
  });
  const blobContent = Buffer.isBuffer(blobStdout) ? blobStdout : Buffer.from(blobStdout);

  if (mode === "120000") {
    return {
      kind: "symlink",
      target: blobContent.toString("utf8"),
    };
  }

  return {
    kind: "file",
    content: blobContent,
    mode: Number.parseInt(mode, 8) & 0o777,
  };
}

function removeEmptyParentDirs(startDir: string, stopDir: string): void {
  let current = startDir;
  while (current.startsWith(stopDir) && current !== stopDir) {
    if (!fs.existsSync(current)) {
      current = path.dirname(current);
      continue;
    }
    if (fs.readdirSync(current).length > 0) break;
    fs.rmdirSync(current);
    current = path.dirname(current);
  }
}

function writeLocalEntry(absPath: string, entry: CheckoutEntry, rootDir: string): void {
  if (entry === null) {
    fs.rmSync(absPath, { force: true, recursive: true });
    removeEmptyParentDirs(path.dirname(absPath), rootDir);
    return;
  }

  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  if (fs.existsSync(absPath)) {
    const stat = fs.lstatSync(absPath);
    if (!stat.isFile() && !stat.isSymbolicLink()) {
      fs.rmSync(absPath, { force: true, recursive: true });
    } else if (entry.kind === "symlink" || stat.isSymbolicLink()) {
      fs.rmSync(absPath, { force: true, recursive: true });
    }
  }

  if (entry.kind === "symlink") {
    fs.symlinkSync(entry.target, absPath);
    return;
  }

  fs.writeFileSync(absPath, entry.content);
  fs.chmodSync(absPath, entry.mode);
}

async function findWorktreePathForBranch(repoPath: string, branch: string): Promise<string | null> {
  assertSafeGitRef(branch);

  const output = await runGit(repoPath, ["worktree", "list", "--porcelain"]);
  const blocks = output.split(/\n\n+/);

  for (const block of blocks) {
    let worktreePath: string | null = null;
    let worktreeBranch: string | null = null;

    for (const line of block.split("\n")) {
      if (line.startsWith("worktree ")) {
        worktreePath = line.slice("worktree ".length);
      } else if (line.startsWith("branch refs/heads/")) {
        worktreeBranch = line.slice("branch refs/heads/".length);
      }
    }

    if (worktreeBranch === branch && worktreePath) {
      return worktreePath;
    }
  }

  return null;
}

async function loadChangedPathStates(
  repoPath: string,
  changedPaths: string[],
): Promise<ChangedPathState[]> {
  return Promise.all(
    changedPaths.map(async (relativePath) => ({
      path: relativePath,
      headEntry: await readHeadEntry(repoPath, relativePath),
      rootEntry: readLocalEntry(path.join(repoPath, relativePath)),
    })),
  );
}

function findConflictingPaths(worktreePath: string, changedPaths: ChangedPathState[]): string[] {
  const conflicts: string[] = [];

  for (const changedPath of changedPaths) {
    const worktreeEntry = readLocalEntry(path.join(worktreePath, changedPath.path));
    if (
      !entriesEqual(worktreeEntry, changedPath.headEntry) &&
      !entriesEqual(worktreeEntry, changedPath.rootEntry)
    ) {
      conflicts.push(changedPath.path);
    }
  }

  return conflicts;
}

function applyChangedPathsToWorktree(
  repoPath: string,
  worktreePath: string,
  changedPaths: ChangedPathState[],
): void {
  for (const changedPath of changedPaths) {
    const targetPath = path.join(worktreePath, changedPath.path);
    const worktreeEntry = readLocalEntry(targetPath);
    if (entriesEqual(worktreeEntry, changedPath.rootEntry)) continue;

    const rootPath = path.join(repoPath, changedPath.path);
    if (changedPath.rootEntry === null) {
      writeLocalEntry(targetPath, null, worktreePath);
      continue;
    }

    writeLocalEntry(targetPath, readLocalEntry(rootPath), worktreePath);
  }
}

async function commitChangedPathsToWorktree(
  repoPath: string,
  worktreePath: string,
  changedPaths: string[],
  commitMessage: string,
): Promise<string> {
  const overlappingStagedPaths = (await listStagedPaths(worktreePath)).filter((changedPath) =>
    changedPaths.includes(changedPath),
  );
  if (overlappingStagedPaths.length > 0) {
    throw new Error(
      `Cannot commit main worktree changes because the Trace worktree already has staged changes on the same paths: ${previewPaths(
        overlappingStagedPaths,
      )}`,
    );
  }

  const changedPathStates = await loadChangedPathStates(repoPath, changedPaths);
  const conflicts = findConflictingPaths(worktreePath, changedPathStates);
  if (conflicts.length > 0) {
    throw new Error(
      `Cannot commit main worktree changes because the Trace worktree also changed: ${previewPaths(
        conflicts,
      )}`,
    );
  }

  applyChangedPathsToWorktree(repoPath, worktreePath, changedPathStates);

  let targetCommitSha = await getCurrentCommitSha(worktreePath);
  const importedChangesDirty = await hasUncommittedChangesForPaths(worktreePath, changedPaths);
  if (importedChangesDirty) {
    await execFileAsync("git", ["add", "-A", "--", ...changedPaths], {
      cwd: worktreePath,
      maxBuffer: GIT_MAX_BUFFER,
    });
    await execFileAsync("git", ["commit", "--only", "-m", commitMessage, "--", ...changedPaths], {
      cwd: worktreePath,
      maxBuffer: GIT_MAX_BUFFER,
    });
    targetCommitSha = await getCurrentCommitSha(worktreePath);
  }

  await restoreRootCheckoutPaths(repoPath, changedPathStates);
  return targetCommitSha;
}

async function restoreRootCheckoutPaths(
  repoPath: string,
  changedPaths: ChangedPathState[],
): Promise<void> {
  const headBackedPaths = changedPaths
    .filter((changedPath) => changedPath.headEntry !== null)
    .map((changedPath) => changedPath.path);
  const addedPaths = changedPaths
    .filter((changedPath) => changedPath.headEntry === null)
    .map((changedPath) => changedPath.path);

  if (headBackedPaths.length > 0) {
    await execFileAsync(
      "git",
      ["restore", "--source=HEAD", "--staged", "--worktree", "--", ...headBackedPaths],
      {
        cwd: repoPath,
        maxBuffer: GIT_MAX_BUFFER,
      },
    );
  }

  if (addedPaths.length > 0) {
    await execFileAsync("git", ["rm", "--cached", "-r", "--ignore-unmatch", "--", ...addedPaths], {
      cwd: repoPath,
      maxBuffer: GIT_MAX_BUFFER,
    }).catch(() => undefined);

    for (const relativePath of addedPaths) {
      const absPath = path.join(repoPath, relativePath);
      fs.rmSync(absPath, { force: true, recursive: true });
      removeEmptyParentDirs(path.dirname(absPath), repoPath);
    }
  }
}

function buildStatus(
  repoId: string,
  repoPath: string | null,
  attachment: LinkedCheckoutConfig | null,
  currentBranch: string | null,
  currentCommitSha: string | null,
  hasUncommittedChangesInRepo: boolean,
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
    hasUncommittedChanges: hasUncommittedChangesInRepo,
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
    return buildStatus(repoId, null, attachment, null, null, false);
  }

  const [{ currentBranch, currentCommitSha }, dirty] = await Promise.all([
    readCurrentGitState(repoPath),
    hasUncommittedChanges(repoPath).catch(() => false),
  ]);
  return buildStatus(repoId, repoPath, attachment, currentBranch, currentCommitSha, dirty);
}

async function actionResult(
  repoId: string,
  ok: boolean,
  error: string | null = null,
  errorCode: BridgeLinkedCheckoutErrorCode | null = null,
): Promise<LinkedCheckoutActionResult> {
  return {
    ok,
    error,
    errorCode,
    status: await readStatus(repoId),
  };
}

function getLinkedCheckoutErrorCode(error: unknown): BridgeLinkedCheckoutErrorCode | null {
  return error instanceof LinkedCheckoutError ? error.errorCode : null;
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
      const existingAttachment = getRepoConfig(input.repoId)?.linkedCheckout ?? null;
      const restorePoint = existingAttachment ?? (await captureRestorePoint(repoPath));
      await fetchOriginIfAvailable(repoPath);
      let targetCommitSha = await resolveTargetCommitSha(repoPath, input.branch, input.commitSha);
      let rebaseAttachmentPrimed = false;

      if (await requiresSyncConflictResolution(repoPath, targetCommitSha)) {
        if (input.conflictStrategy === "discard") {
          await discardAllChanges(repoPath);
        } else if (input.conflictStrategy === "commit") {
          const changedPaths = await listChangedPaths(repoPath);
          if (changedPaths.length === 0) {
            throw new Error("Root checkout has no live changes to commit.");
          }

          const worktreePath = await findWorktreePathForBranch(repoPath, input.branch);
          if (!worktreePath) {
            throw new Error("Trace worktree is not available for the attached branch.");
          }

          targetCommitSha = await commitChangedPathsToWorktree(
            repoPath,
            worktreePath,
            changedPaths,
            resolveCommitMessage(input.commitMessage),
          );
        } else if (input.conflictStrategy === "rebase") {
          const hadStash = await stashAllChanges(repoPath);
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
          rebaseAttachmentPrimed = true;
          if (hadStash) {
            await popStashedChanges(repoPath);
          }
        } else {
          throw new LinkedCheckoutError(
            "Root checkout has local changes that must be resolved before syncing.",
            "DIRTY_ROOT_CHECKOUT",
          );
        }
      }

      if (input.conflictStrategy !== "rebase") {
        await switchToDetachedCommit(repoPath, targetCommitSha);
      }

      if (!rebaseAttachmentPrimed) {
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
      } else {
        const latestAttachment = getRepoConfig(input.repoId)?.linkedCheckout;
        if (latestAttachment) {
          await setRepoLinkedCheckout(input.repoId, {
            ...latestAttachment,
            autoSyncEnabled: input.autoSyncEnabled ?? latestAttachment.autoSyncEnabled,
            lastSyncedCommitSha: targetCommitSha,
            lastSyncError: null,
            lastSyncAt: new Date().toISOString(),
          });
        }
      }
      triggerAutoSyncReconcile(input.repoId);

      return actionResult(input.repoId, true);
    } catch (error) {
      const message = formatGitError(error);
      const errorCode = getLinkedCheckoutErrorCode(error);
      if (errorCode !== "DIRTY_ROOT_CHECKOUT") {
        await pauseExistingAttachment(input.repoId, message);
      }
      return actionResult(input.repoId, false, message, errorCode);
    }
  });
}

export function commitLinkedCheckoutChanges(
  input: CommitLinkedCheckoutChangesInput,
): Promise<LinkedCheckoutActionResult> {
  return withRepoLock(input.repoId, async () => {
    const repoConfig = getRepoConfig(input.repoId);
    const repoPath = repoConfig?.path;
    const attachment = repoConfig?.linkedCheckout;

    if (!repoPath) {
      return actionResult(
        input.repoId,
        false,
        "Link this repo to a local checkout in Trace Desktop before committing.",
      );
    }

    if (!attachment) {
      return actionResult(input.repoId, false, "Root checkout is not attached to a Trace session.");
    }

    if (attachment.sessionGroupId !== input.sessionGroupId) {
      return actionResult(
        input.repoId,
        false,
        "Root checkout is attached to another Trace session.",
      );
    }

    try {
      const currentBranch = await getCurrentBranch(repoPath);
      if (currentBranch !== null) {
        throw new Error("Root checkout is no longer on the detached Trace commit.");
      }

      const changedPaths = await listChangedPaths(repoPath);
      if (changedPaths.length === 0) {
        throw new Error("Root checkout has no live changes to commit.");
      }

      const worktreePath = await findWorktreePathForBranch(repoPath, attachment.targetBranch);
      if (!worktreePath) {
        throw new Error("Trace worktree is not available for the attached branch.");
      }
      const targetCommitSha = await commitChangedPathsToWorktree(
        repoPath,
        worktreePath,
        changedPaths,
        resolveCommitMessage(input.message),
      );
      await switchToDetachedCommit(repoPath, targetCommitSha);

      const latestAttachment = getRepoConfig(input.repoId)?.linkedCheckout;
      if (latestAttachment) {
        await setRepoLinkedCheckout(input.repoId, {
          ...latestAttachment,
          lastSyncedCommitSha: targetCommitSha,
          lastSyncError: null,
          lastSyncAt: new Date().toISOString(),
        });
      }
      triggerAutoSyncReconcile(input.repoId);

      return actionResult(input.repoId, true);
    } catch (error) {
      return actionResult(input.repoId, false, formatGitError(error));
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
