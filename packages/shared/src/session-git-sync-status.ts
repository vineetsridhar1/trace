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

export async function inspectSessionGitSyncStatus(
  runGit: GitSyncStatusRunner,
): Promise<BridgeSessionGitSyncStatus> {
  const [headStdout, trackedStatusStdout, untrackedStdout, branch, upstreamBranch] =
    await Promise.all([
      runGit(["rev-parse", "HEAD"], {
        maxBuffer: DEFAULT_MAX_BUFFER,
        timeoutMs: DEFAULT_TIMEOUT_MS,
      }),
      runGit(["status", "--porcelain=v1", "--untracked-files=no", "--ignore-submodules=dirty"], {
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

  const upstreamCommitSha = upstreamBranch
    ? await maybeReadGitRef(runGit, ["rev-parse", `${upstreamBranch}^{commit}`])
    : null;
  const remoteBranch = branch ? `origin/${branch}` : null;
  const remoteCommitSha = remoteBranch
    ? await maybeReadGitRef(runGit, ["rev-parse", `${remoteBranch}^{commit}`])
    : null;

  const upstreamDivergence = await countDivergence(runGit, upstreamBranch);
  const remoteDivergence = await countDivergence(runGit, remoteCommitSha ? remoteBranch : null);

  return {
    branch,
    headCommitSha: headStdout.trim() || null,
    upstreamBranch,
    upstreamCommitSha,
    aheadCount: upstreamDivergence.aheadCount,
    behindCount: upstreamDivergence.behindCount,
    remoteBranch: remoteCommitSha ? remoteBranch : null,
    remoteCommitSha,
    remoteAheadCount: remoteDivergence.aheadCount,
    remoteBehindCount: remoteDivergence.behindCount,
    hasUncommittedChanges:
      trackedStatusStdout.trim().length > 0 || untrackedStdout.trim().length > 0,
  };
}
