import path from "path";
import os from "os";
import fs from "fs";
import { execFile } from "child_process";
import { promisify } from "util";
import { generateAnimalSlug, getUsedSlugs } from "@trace/shared/animal-names";
import { assertValidCommitSha } from "@trace/shared";
import { installOrRepairRepoHooks } from "./repo-hooks.js";

const execFileAsync = promisify(execFile);
const MAX_AUTO_SLUG_ATTEMPTS = 25;

type GitExecError = Error & {
  stderr?: string;
  stdout?: string;
};

async function refExists(repoPath: string, ref: string): Promise<boolean> {
  return execFileAsync(
    "git", ["rev-parse", "--verify", ref],
    { cwd: repoPath },
  ).then(() => true, () => false);
}

async function resolveBaseBranch(
  repoPath: string,
  startBranch: string | undefined,
  defaultBranch: string,
): Promise<string> {
  const candidate = startBranch ?? defaultBranch;

  // 1. Remote tracking branch (current behavior, works when pushed)
  const remote = `origin/${candidate}`;
  if (await refExists(repoPath, remote)) return remote;

  // 2. Local ref (branch exists locally but was never pushed)
  if (await refExists(repoPath, candidate)) return candidate;

  // 3. Safe fallback to repo's main branch on remote
  return `origin/${defaultBranch}`;
}

function getGitErrorText(error: unknown): string {
  if (error instanceof Error) {
    const gitError = error as GitExecError;
    if (gitError.stderr?.trim()) return gitError.stderr.trim();
    if (gitError.stdout?.trim()) return gitError.stdout.trim();
    return gitError.message.trim();
  }
  return String(error).trim();
}

function isWorktreeCollisionError(error: unknown, branch: string, targetPath: string): boolean {
  const message = getGitErrorText(error).toLowerCase();
  const normalizedBranch = branch.toLowerCase();
  const normalizedTargetPath = targetPath.toLowerCase();

  return (
    (message.includes(normalizedBranch) &&
      (message.includes("already exists") || message.includes("already checked out"))) ||
    (message.includes(normalizedTargetPath) && message.includes("already exists"))
  );
}

export async function createWorktree({
  repoPath,
  repoId,
  sessionId,
  sessionGroupId,
  slug,
  defaultBranch,
  startBranch,
  checkpointSha,
  gitHooksEnabled,
}: {
  repoPath: string;
  repoId: string;
  sessionId: string;
  /** When set, the worktree and branch are keyed by this ID so all sessions in the group share the same workspace. */
  sessionGroupId?: string;
  /** Pre-assigned animal slug. If absent, one is generated. */
  slug?: string;
  defaultBranch: string;
  /** Branch to base the new worktree on (e.g. from the parent session). Falls back to defaultBranch. */
  startBranch?: string;
  /** Commit SHA to restore from instead of branching from origin/{startBranch|defaultBranch}. */
  checkpointSha?: string;
  /** When enabled for the linked repo, install or repair Trace-managed hooks. */
  gitHooksEnabled?: boolean;
}): Promise<{ workdir: string; branch: string; slug: string }> {
  const sessionsDir = path.join(os.homedir(), "trace", "sessions", repoId);
  const shouldRetryCollisions = !slug;

  // Ensure parent directory exists
  fs.mkdirSync(sessionsDir, { recursive: true });

  if (checkpointSha) assertValidCommitSha(checkpointSha);

  // Fetch latest before slug selection so origin/trace/* collisions are visible.
  if (!checkpointSha) {
    await execFileAsync("git", ["fetch", "origin", "--prune"], { cwd: repoPath });
  } else {
    // Verify the checkpoint SHA is reachable locally; fetch if not
    const reachable = await execFileAsync("git", ["cat-file", "-t", checkpointSha], { cwd: repoPath })
      .then(() => true)
      .catch(() => false);
    if (!reachable) {
      await execFileAsync("git", ["fetch", "origin", "--prune"], { cwd: repoPath });
    }
  }

  // Resolve base branch with fallback chain (remote → local → default)
  const baseRef = checkpointSha
    ?? await resolveBaseBranch(repoPath, startBranch, defaultBranch);
  const usedSlugs = shouldRetryCollisions ? await getUsedSlugs(sessionsDir, repoPath) : null;

  for (let attempt = 0; attempt < MAX_AUTO_SLUG_ATTEMPTS; attempt += 1) {
    const worktreeSlug = slug ?? generateAnimalSlug(usedSlugs ?? new Set<string>());
    const branch = `trace/${worktreeSlug}`;
    const targetPath = path.join(sessionsDir, worktreeSlug);

    // If the worktree directory already exists, only reuse it for an explicitly assigned slug.
    if (fs.existsSync(targetPath)) {
      if (!shouldRetryCollisions) {
        return { workdir: targetPath, branch, slug: worktreeSlug };
      }
      usedSlugs?.add(worktreeSlug);
      continue;
    }

    // Reuse explicit branch names, but retry auto-generated collisions.
    if (await refExists(repoPath, branch)) {
      if (!shouldRetryCollisions) {
        await execFileAsync(
          "git",
          ["worktree", "add", targetPath, branch],
          { cwd: repoPath },
        );
        if (gitHooksEnabled) {
          await installOrRepairRepoHooks(targetPath);
        }
        return { workdir: targetPath, branch, slug: worktreeSlug };
      }
      usedSlugs?.add(worktreeSlug);
      continue;
    }

    try {
      await execFileAsync(
        "git",
        ["worktree", "add", "-b", branch, targetPath, baseRef],
        { cwd: repoPath },
      );
    } catch (error) {
      if (shouldRetryCollisions && isWorktreeCollisionError(error, branch, targetPath)) {
        usedSlugs?.add(worktreeSlug);
        continue;
      }
      throw error;
    }

    if (gitHooksEnabled) {
      await installOrRepairRepoHooks(targetPath);
    }

    return { workdir: targetPath, branch, slug: worktreeSlug };
  }

  throw new Error("Failed to allocate a unique worktree slug after repeated collisions");
}

export async function removeWorktree({
  repoPath,
  worktreePath,
}: {
  repoPath: string;
  worktreePath: string;
}): Promise<void> {
  await execFileAsync("git", ["worktree", "remove", worktreePath], {
    cwd: repoPath,
  });
}
