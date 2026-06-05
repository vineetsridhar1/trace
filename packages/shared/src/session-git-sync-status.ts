import type { BridgeSessionGitSyncStatus } from "./bridge.js";

export interface GitSyncStatusCommandOptions {
  maxBuffer?: number;
  timeoutMs?: number;
}

export type GitSyncStatusRunner = (
  args: string[],
  options?: GitSyncStatusCommandOptions,
) => Promise<string>;

const DEFAULT_MAX_BUFFER = 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 10_000;
const CURRENT_BRANCH_TIMEOUT_MS = 5_000;

export async function inspectSessionCurrentBranch(
  runGit: GitSyncStatusRunner,
): Promise<string | null> {
  const stdout = await runGit(["branch", "--show-current"], {
    maxBuffer: DEFAULT_MAX_BUFFER,
    timeoutMs: CURRENT_BRANCH_TIMEOUT_MS,
  });
  const branch = stdout.trim();
  return branch.length > 0 ? branch : null;
}

async function maybeReadGitRef(
  runGit: GitSyncStatusRunner,
  args: string[],
): Promise<string | null> {
  try {
    const stdout = await runGit(args, {
      maxBuffer: DEFAULT_MAX_BUFFER,
      timeoutMs: DEFAULT_TIMEOUT_MS,
    });
    const value = stdout.trim();
    return value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

async function countDivergence(
  runGit: GitSyncStatusRunner,
  ref: string | null,
): Promise<{ aheadCount: number; behindCount: number }> {
  if (!ref) return { aheadCount: 0, behindCount: 0 };
  const stdout = await runGit(["rev-list", "--left-right", "--count", `HEAD...${ref}`], {
    maxBuffer: DEFAULT_MAX_BUFFER,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  });
  const [aheadRaw = "0", behindRaw = "0"] = stdout.trim().split(/\s+/);
  return {
    aheadCount: Number.parseInt(aheadRaw, 10) || 0,
    behindCount: Number.parseInt(behindRaw, 10) || 0,
  };
}

// Authoritatively ask origin for a branch's tip. Unlike the local origin/<branch>
// tracking ref, this reflects the true remote state even when the checkout never
// fetched the branch. Returns null when origin has no such branch or on failure.
async function readRemoteBranchTip(
  runGit: GitSyncStatusRunner,
  branch: string,
): Promise<string | null> {
  try {
    const stdout = await runGit(["ls-remote", "--heads", "origin", branch], {
      maxBuffer: DEFAULT_MAX_BUFFER,
      timeoutMs: DEFAULT_TIMEOUT_MS,
    });
    const [firstLine = ""] = stdout.trim().split("\n", 1);
    const [sha = ""] = firstLine.split(/\s+/, 1);
    return /^[0-9a-f]{40,}$/i.test(sha) ? sha : null;
  } catch {
    return null;
  }
}

function divergenceFromShaComparison(
  headCommitSha: string | null,
  remoteCommitSha: string | null,
): { aheadCount: number; behindCount: number } {
  if (!headCommitSha || !remoteCommitSha || headCommitSha === remoteCommitSha) {
    return { aheadCount: 0, behindCount: 0 };
  }
  // The remote tip differs from HEAD, but the remote commit may not exist locally
  // so the direction can't be measured. Treat any difference as divergence so the
  // move guard requires syncing the branch first.
  return { aheadCount: 1, behindCount: 1 };
}

export async function inspectSessionGitSyncStatus(
  runGit: GitSyncStatusRunner,
): Promise<BridgeSessionGitSyncStatus> {
  const [headStdout, trackedStatusStdout, untrackedStdout, branch, upstreamBranch] =
    await Promise.all([
      runGit(["rev-parse", "HEAD"], {
        maxBuffer: DEFAULT_MAX_BUFFER,
        timeoutMs: DEFAULT_TIMEOUT_MS,
      }),
      runGit(["status", "--porcelain=v1", "--untracked-files=no"], {
        maxBuffer: DEFAULT_MAX_BUFFER,
        timeoutMs: DEFAULT_TIMEOUT_MS,
      }),
      runGit(
        ["ls-files", "--others", "--exclude-standard", "--directory", "--no-empty-directory"],
        {
          maxBuffer: DEFAULT_MAX_BUFFER,
          timeoutMs: DEFAULT_TIMEOUT_MS,
        },
      ),
      maybeReadGitRef(runGit, ["symbolic-ref", "--short", "-q", "HEAD"]),
      maybeReadGitRef(runGit, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]),
    ]);

  const localRemoteBranch = branch ? `origin/${branch}` : null;
  const headCommitSha = headStdout.trim() || null;
  const [upstreamCommitSha, localRemoteCommitSha] = await Promise.all([
    upstreamBranch ? maybeReadGitRef(runGit, ["rev-parse", `${upstreamBranch}^{commit}`]) : null,
    localRemoteBranch
      ? maybeReadGitRef(runGit, ["rev-parse", `${localRemoteBranch}^{commit}`])
      : null,
  ]);

  // The local origin/<branch> tracking ref can be missing or stale even when the
  // branch exists on origin (e.g. pushed without -u, or a checkout that never
  // fetched it). Ask origin directly so a pushed branch is not mistaken for an
  // unpushed one when guarding a session move.
  const [upstreamDivergence, remoteTipFromOrigin] = await Promise.all([
    countDivergence(runGit, upstreamBranch),
    branch && !localRemoteCommitSha ? readRemoteBranchTip(runGit, branch) : null,
  ]);

  const remoteResolvedFromOrigin = !localRemoteCommitSha && remoteTipFromOrigin !== null;
  const remoteCommitSha = localRemoteCommitSha ?? remoteTipFromOrigin;
  const remoteDivergence = remoteResolvedFromOrigin
    ? divergenceFromShaComparison(headCommitSha, remoteCommitSha)
    : await countDivergence(runGit, localRemoteCommitSha ? localRemoteBranch : null);

  return {
    branch,
    headCommitSha,
    upstreamBranch,
    upstreamCommitSha,
    aheadCount: upstreamDivergence.aheadCount,
    behindCount: upstreamDivergence.behindCount,
    remoteBranch: remoteCommitSha ? localRemoteBranch : null,
    remoteCommitSha,
    remoteAheadCount: remoteDivergence.aheadCount,
    remoteBehindCount: remoteDivergence.behindCount,
    hasUncommittedChanges:
      trackedStatusStdout.trim().length > 0 || untrackedStdout.trim().length > 0,
  };
}
