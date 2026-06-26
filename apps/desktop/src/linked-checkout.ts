import fs from "fs";
import path from "path";
import {
  assertValidCommitSha,
  type BridgeLinkedCheckoutActionResultPayload,
  type BridgeLinkedCheckoutChangedFile,
  type BridgeLinkedCheckoutErrorCode,
  type BridgeLinkedCheckoutStatus,
} from "@trace/shared";
import {
  getRepoConfig,
  saveRepoPath,
  setRepoLinkedCheckout,
  type LinkedCheckoutConfig,
} from "./config.js";
import { installOrRepairRepoHooksBestEffort } from "./repo-hooks.js";
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
  refreshBeforeSync?: boolean;
  conflictStrategy?: "discard" | "commit" | "rebase" | "stash" | null;
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
const LINKED_CHECKOUT_SYNC_STASH_MESSAGE = "Trace linked checkout stash";
const LINKED_CHECKOUT_DIFF_PREVIEW_LIMIT = 80_000;
const LINKED_CHECKOUT_CONTENT_PREVIEW_LIMIT = 80_000;
const LINKED_CHECKOUT_STATUS_FILE_LIMIT = 200;
const LINKED_CHECKOUT_LINE_COUNT_BYTE_LIMIT = 2_000_000;

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

async function listDiffChangedPaths(repoPath: string): Promise<string[]> {
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

async function listChangedPaths(repoPath: string): Promise<string[]> {
  const { stdout } = await execFileAsync(
    "git",
    ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    {
      cwd: repoPath,
      maxBuffer: GIT_MAX_BUFFER,
    },
  );
  const entries = parseNullSeparated(stdout);
  const paths: string[] = [];

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry.length < 4) continue;

    const statusCode = entry.slice(0, 2);
    paths.push(entry.slice(3));

    if (statusCode.includes("R") || statusCode.includes("C")) {
      index += 1;
    }
  }

  const statusPaths = [...new Set(paths)];
  if (statusPaths.length > 0) return statusPaths;

  return listDiffChangedPaths(repoPath);
}

function countDiffLines(diff: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;

  for (const line of diff.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) additions += 1;
    if (line.startsWith("-")) deletions += 1;
  }

  return { additions, deletions };
}

async function readTrackedLineCounts(
  repoPath: string,
): Promise<Map<string, { additions: number; deletions: number }>> {
  const { stdout } = await execFileAsync(
    "git",
    ["diff", "--numstat", "-z", "--no-renames", "HEAD"],
    {
      cwd: repoPath,
      maxBuffer: GIT_MAX_BUFFER,
    },
  );

  const counts = new Map<string, { additions: number; deletions: number }>();
  for (const entry of parseNullSeparated(stdout)) {
    const firstTab = entry.indexOf("\t");
    const secondTab = entry.indexOf("\t", firstTab + 1);
    if (firstTab < 0 || secondTab < 0) continue;

    const path = entry.slice(secondTab + 1);
    const additions = Number.parseInt(entry.slice(0, firstTab), 10);
    const deletions = Number.parseInt(entry.slice(firstTab + 1, secondTab), 10);
    counts.set(path, {
      additions: Number.isFinite(additions) ? additions : 0,
      deletions: Number.isFinite(deletions) ? deletions : 0,
    });
  }
  return counts;
}

async function readChangedStatuses(repoPath: string): Promise<Map<string, string>> {
  const { stdout } = await execFileAsync(
    "git",
    ["diff", "--name-status", "-z", "--no-renames", "HEAD"],
    {
      cwd: repoPath,
      maxBuffer: GIT_MAX_BUFFER,
    },
  );

  const statuses = new Map<string, string>();
  const fields = parseNullSeparated(stdout);
  for (let index = 0; index + 1 < fields.length; index += 2) {
    const status = fields[index]?.[0];
    const path = fields[index + 1];
    if (status && path) statuses.set(path, status);
  }
  return statuses;
}

function resolveTrackedStatus(
  repoPath: string,
  relativePath: string,
  statuses: Map<string, string>,
): string {
  const status = statuses.get(relativePath);
  if (status) return status;
  return fs.existsSync(path.join(repoPath, relativePath)) ? "M" : "D";
}

function countTextLines(content: Buffer): number {
  if (content.length === 0 || content.includes(0)) return 0;

  const text = content.toString("utf8");
  const trailingNewline = text.endsWith("\n") ? 1 : 0;
  return text.split("\n").length - trailingNewline;
}

function readUntrackedFileLineCounts(
  repoPath: string,
  relativePath: string,
): { additions: number; deletions: number } {
  const absPath = path.join(repoPath, relativePath);
  const stat = fs.existsSync(absPath) ? fs.statSync(absPath) : null;
  if (!stat?.isFile() || stat.size > LINKED_CHECKOUT_LINE_COUNT_BYTE_LIMIT) {
    return { additions: 0, deletions: 0 };
  }

  return {
    additions: countTextLines(fs.readFileSync(absPath)),
    deletions: 0,
  };
}

async function readFileDiffPreview(
  repoPath: string,
  relativePath: string,
): Promise<{
  diff: string;
  truncated: boolean;
}> {
  const { stdout } = await execFileAsync(
    "git",
    ["diff", "--no-ext-diff", "--no-color", "HEAD", "--", relativePath],
    {
      cwd: repoPath,
      maxBuffer: GIT_MAX_BUFFER,
    },
  );

  if (stdout.length <= LINKED_CHECKOUT_DIFF_PREVIEW_LIMIT) {
    return { diff: stdout, truncated: false };
  }

  return {
    diff: stdout.slice(0, LINKED_CHECKOUT_DIFF_PREVIEW_LIMIT),
    truncated: true,
  };
}

function readUntrackedFileDiffPreview(
  repoPath: string,
  relativePath: string,
): { diff: string; truncated: boolean } {
  const absPath = path.join(repoPath, relativePath);
  const stat = fs.existsSync(absPath) ? fs.statSync(absPath) : null;
  if (!stat?.isFile()) {
    return {
      diff: `diff --git a/${relativePath} b/${relativePath}\nnew file mode 100644\n`,
      truncated: false,
    };
  }

  const content = fs.readFileSync(absPath);
  if (content.includes(0)) {
    return {
      diff: `diff --git a/${relativePath} b/${relativePath}\nnew file mode 100644\nBinary file ${relativePath} added\n`,
      truncated: false,
    };
  }

  const text = content.toString("utf8");
  const diff = [
    `diff --git a/${relativePath} b/${relativePath}`,
    "new file mode 100644",
    "--- /dev/null",
    `+++ b/${relativePath}`,
    "@@",
    ...text.split("\n").map((line) => `+${line}`),
  ].join("\n");

  if (diff.length <= LINKED_CHECKOUT_DIFF_PREVIEW_LIMIT) {
    return { diff, truncated: false };
  }

  return {
    diff: diff.slice(0, LINKED_CHECKOUT_DIFF_PREVIEW_LIMIT),
    truncated: true,
  };
}

function formatBinaryContent(relativePath: string): string {
  return `Binary file ${relativePath} cannot be previewed.`;
}

function truncateContent(content: string): { content: string; truncated: boolean } {
  if (content.length <= LINKED_CHECKOUT_CONTENT_PREVIEW_LIMIT) {
    return { content, truncated: false };
  }
  return {
    content: content.slice(0, LINKED_CHECKOUT_CONTENT_PREVIEW_LIMIT),
    truncated: true,
  };
}

async function readHeadContentPreview(
  repoPath: string,
  relativePath: string,
): Promise<{ content: string; truncated: boolean }> {
  const { stdout } = await execFileAsync("git", ["show", `HEAD:${relativePath}`], {
    cwd: repoPath,
    encoding: "buffer",
    maxBuffer: GIT_MAX_BUFFER,
  });

  if (stdout.includes(0)) {
    return { content: formatBinaryContent(relativePath), truncated: false };
  }

  return truncateContent(stdout.toString("utf8"));
}

function readWorkingContentPreview(
  repoPath: string,
  relativePath: string,
): { content: string; truncated: boolean } {
  const absPath = path.join(repoPath, relativePath);
  const stat = fs.existsSync(absPath) ? fs.statSync(absPath) : null;
  if (!stat?.isFile()) return { content: "", truncated: false };

  const content = fs.readFileSync(absPath);
  if (content.includes(0)) {
    return { content: formatBinaryContent(relativePath), truncated: false };
  }

  return truncateContent(content.toString("utf8"));
}

async function getChangedFileStatus(repoPath: string, relativePath: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "git",
    ["diff", "--name-status", "--no-renames", "HEAD", "--", relativePath],
    {
      cwd: repoPath,
      maxBuffer: GIT_MAX_BUFFER,
    },
  );
  const status = stdout.trim().split(/\s+/)[0]?.[0];
  if (status) return status;
  return fs.existsSync(path.join(repoPath, relativePath)) ? "M" : "D";
}

async function readChangedFileContents(
  repoPath: string,
  relativePath: string,
  untracked: boolean,
): Promise<{
  originalContent: string;
  modifiedContent: string;
  contentTruncated: boolean;
}> {
  const [original, modified] = await Promise.all([
    untracked
      ? Promise.resolve({ content: "", truncated: false })
      : readHeadContentPreview(repoPath, relativePath).catch(() => ({
          content: "",
          truncated: false,
        })),
    Promise.resolve(readWorkingContentPreview(repoPath, relativePath)),
  ]);

  return {
    originalContent: original.content,
    modifiedContent: modified.content,
    contentTruncated: original.truncated || modified.truncated,
  };
}

async function listChangedFiles(repoPath: string): Promise<{
  files: BridgeLinkedCheckoutChangedFile[];
  totalCount: number;
  truncated: boolean;
}> {
  const [changedPaths, untrackedPaths, trackedLineCounts, trackedStatuses] = await Promise.all([
    listChangedPaths(repoPath),
    listUntrackedPaths(repoPath),
    readTrackedLineCounts(repoPath).catch(
      () => new Map<string, { additions: number; deletions: number }>(),
    ),
    readChangedStatuses(repoPath).catch(() => new Map<string, string>()),
  ]);
  const untrackedPathSet = new Set(untrackedPaths);

  const files = changedPaths
    .slice(0, LINKED_CHECKOUT_STATUS_FILE_LIMIT)
    .map((relativePath) => {
      const untracked = untrackedPathSet.has(relativePath);
      const lineCounts = untracked
        ? readUntrackedFileLineCounts(repoPath, relativePath)
        : trackedLineCounts.get(relativePath) ?? { additions: 0, deletions: 0 };

      return {
        path: relativePath,
        status: untracked
          ? "A"
          : resolveTrackedStatus(repoPath, relativePath, trackedStatuses),
        additions: lineCounts.additions,
        deletions: lineCounts.deletions,
        diff: "",
        truncated: false,
        originalContent: "",
        modifiedContent: "",
        contentTruncated: false,
      };
    });
  return {
    files,
    totalCount: changedPaths.length,
    truncated: changedPaths.length > files.length,
  };
}

async function readChangedFilePreview(
  repoPath: string,
  relativePath: string,
): Promise<BridgeLinkedCheckoutChangedFile> {
  const untracked = new Set(await listUntrackedPaths(repoPath)).has(relativePath);
  const { diff, truncated } = await Promise.resolve(
    untracked
      ? readUntrackedFileDiffPreview(repoPath, relativePath)
      : readFileDiffPreview(repoPath, relativePath),
  ).catch((error: unknown) => ({
    diff: `Unable to load diff for ${relativePath}: ${formatGitError(error)}`,
    truncated: false,
  }));
  const lineCounts = countDiffLines(diff);
  const contents = await readChangedFileContents(repoPath, relativePath, untracked);

  return {
    path: relativePath,
    status: untracked ? "A" : await getChangedFileStatus(repoPath, relativePath),
    additions: lineCounts.additions,
    deletions: lineCounts.deletions,
    diff,
    truncated,
    ...contents,
  };
}

async function discardAllChanges(repoPath: string): Promise<void> {
  await runGit(repoPath, ["reset", "--hard", "HEAD"]);
  await runGit(repoPath, ["clean", "-fd"]);
}

async function stashAllChanges(repoPath: string): Promise<boolean> {
  return stashAllChangesWithMessage(repoPath, LINKED_CHECKOUT_REBASE_STASH_MESSAGE);
}

async function stashAllChangesWithMessage(repoPath: string, message: string): Promise<boolean> {
  const before = await hasUncommittedChanges(repoPath);
  if (!before) return false;

  await execFileAsync("git", ["stash", "push", "--include-untracked", "--message", message], {
    cwd: repoPath,
    maxBuffer: GIT_MAX_BUFFER,
  });

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

async function pushBranchToOriginIfAvailable(repoPath: string, branch: string): Promise<boolean> {
  assertSafeGitRef(branch);
  if (branch.includes(":") || branch.startsWith("refs/")) {
    throw new Error(`Unsafe git ref: ${branch}`);
  }

  try {
    await runGit(repoPath, ["remote", "get-url", "origin"]);
  } catch {
    return false;
  }

  await execFileAsync("git", ["push", "origin", `HEAD:refs/heads/${branch}`], {
    cwd: repoPath,
    maxBuffer: GIT_MAX_BUFFER,
  });
  return true;
}

function isMissingRemoteRefError(error: unknown): boolean {
  return formatGitError(error).includes("couldn't find remote ref");
}

async function deleteRemoteTrackingRef(repoPath: string, branch: string): Promise<void> {
  await execFileAsync("git", ["update-ref", "-d", `refs/remotes/origin/${branch}`], {
    cwd: repoPath,
    maxBuffer: GIT_MAX_BUFFER,
  }).catch(() => undefined);
}

export async function fetchTargetBranchIfAvailable(
  repoPath: string,
  branch: string,
): Promise<void> {
  assertSafeGitRef(branch);
  if (branch.includes(":") || branch.startsWith("refs/")) {
    throw new Error(`Unsafe git ref: ${branch}`);
  }
  try {
    await runGit(repoPath, ["remote", "get-url", "origin"]);
  } catch {
    return;
  }

  try {
    await execFileAsync(
      "git",
      ["fetch", "origin", "--prune", `+refs/heads/${branch}:refs/remotes/origin/${branch}`],
      {
        cwd: repoPath,
        maxBuffer: GIT_MAX_BUFFER,
      },
    );
  } catch (error) {
    if (isMissingRemoteRefError(error)) {
      await deleteRemoteTrackingRef(repoPath, branch);
      return;
    }
    console.warn(
      `[linked-checkout] target branch fetch failed; using cached refs: ${formatGitError(error)}`,
    );
  }
}

async function pullTargetWorktreeBranchIfAvailable(
  repoPath: string,
  branch: string,
): Promise<boolean> {
  assertSafeGitRef(branch);
  if (branch.includes(":") || branch.startsWith("refs/")) {
    throw new Error(`Unsafe git ref: ${branch}`);
  }

  const worktreePath = await findWorktreePathForBranch(repoPath, branch);
  if (!worktreePath) return false;

  try {
    await runGit(worktreePath, ["remote", "get-url", "origin"]);
  } catch {
    return false;
  }

  await runGit(worktreePath, [
    "fetch",
    "origin",
    "--prune",
    `+refs/heads/${branch}:refs/remotes/origin/${branch}`,
  ]);
  await runGit(worktreePath, ["merge", "--ff-only", `refs/remotes/origin/${branch}`]);
  return true;
}

export async function refreshTargetBranchForSync(repoPath: string, branch: string): Promise<void> {
  if (await pullTargetWorktreeBranchIfAvailable(repoPath, branch)) return;
  await fetchTargetBranchIfAvailable(repoPath, branch);
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
    if (await isAncestorCommit(repoPath, remoteSha, localSha)) return localSha;
    return remoteSha;
  }

  if (localSha) return localSha;
  if (remoteSha) return remoteSha;

  throw new Error(`Branch not found: ${branch}`);
}

export async function resolveSyncTargetCommitSha(
  repoPath: string,
  branch: string,
  commitSha?: string | null,
): Promise<string> {
  if (commitSha) {
    try {
      return await resolveTargetCommitSha(repoPath, branch, commitSha);
    } catch {
      await fetchTargetBranchIfAvailable(repoPath, branch);
      return resolveTargetCommitSha(repoPath, branch, commitSha);
    }
  }

  const worktreePath = await findWorktreePathForBranch(repoPath, branch);
  if (worktreePath) {
    return getCurrentCommitSha(worktreePath);
  }

  await fetchTargetBranchIfAvailable(repoPath, branch);
  return resolveTargetCommitSha(repoPath, branch);
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
  targetBranch: string,
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

  await pushBranchToOriginIfAvailable(worktreePath, targetBranch);
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
  changedFiles: BridgeLinkedCheckoutChangedFile[],
  changedFilesTotalCount = changedFiles.length,
  changedFilesTruncated = false,
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
    changedFiles,
    changedFilesTotalCount,
    changedFilesTruncated,
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

async function readChangedFilesState(repoPath: string): Promise<{
  dirty: boolean;
  changedFiles: BridgeLinkedCheckoutChangedFile[];
  totalCount: number;
  truncated: boolean;
}> {
  try {
    const changedFiles = await listChangedFiles(repoPath);
    return {
      dirty: changedFiles.totalCount > 0,
      changedFiles: changedFiles.files,
      totalCount: changedFiles.totalCount,
      truncated: changedFiles.truncated,
    };
  } catch {
    const dirty = await hasUncommittedChanges(repoPath).catch(() => false);
    return {
      dirty,
      changedFiles: [],
      totalCount: dirty ? 1 : 0,
      truncated: dirty,
    };
  }
}

async function readStatus(repoId: string): Promise<LinkedCheckoutStatus> {
  const repoConfig = getRepoConfig(repoId);
  const repoPath = repoConfig?.path ?? null;
  const attachment = repoConfig?.linkedCheckout ?? null;

  if (!repoPath) {
    return buildStatus(repoId, null, attachment, null, null, false, []);
  }

  const [{ currentBranch, currentCommitSha }, changedFilesState] = await Promise.all([
    readCurrentGitState(repoPath),
    readChangedFilesState(repoPath),
  ]);
  return buildStatus(
    repoId,
    repoPath,
    attachment,
    currentBranch,
    currentCommitSha,
    changedFilesState.dirty,
    changedFilesState.changedFiles,
    changedFilesState.totalCount,
    changedFilesState.truncated,
  );
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

export async function getLinkedCheckoutChangedFile(
  repoId: string,
  filePath: string,
): Promise<BridgeLinkedCheckoutChangedFile> {
  const repoConfig = getRepoConfig(repoId);
  const repoPath = repoConfig?.path;
  if (!repoPath) {
    throw new Error("Link this repo to a local checkout before reading changed files.");
  }

  const changedPaths = await listChangedPaths(repoPath);
  if (!changedPaths.includes(filePath)) {
    throw new Error("File is not changed in the linked checkout.");
  }

  return readChangedFilePreview(repoPath, filePath);
}

export function linkLinkedCheckoutRepo(
  repoId: string,
  localPath: string,
): Promise<LinkedCheckoutActionResult> {
  return withRepoLock(repoId, async () => {
    try {
      const repoConfig = await saveRepoPath(repoId, localPath);
      if (repoConfig.gitHooksEnabled) {
        await installOrRepairRepoHooksBestEffort(localPath, "linked checkout repo link");
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
      if (input.refreshBeforeSync) {
        await refreshTargetBranchForSync(repoPath, input.branch);
      }
      let targetCommitSha = await resolveSyncTargetCommitSha(
        repoPath,
        input.branch,
        input.commitSha,
      );
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
            input.branch,
            resolveCommitMessage(input.commitMessage),
          );
        } else if (input.conflictStrategy === "stash") {
          await stashAllChangesWithMessage(repoPath, LINKED_CHECKOUT_SYNC_STASH_MESSAGE);
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
        attachment.targetBranch,
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
