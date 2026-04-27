import path from "path";
import os from "os";
import fs from "fs";
import { execFile } from "child_process";
import { generateAnimalSlug, getUsedSlugs } from "@trace/shared/animal-names";
import { assertValidCommitSha } from "@trace/shared";
import { installOrRepairRepoHooks } from "./repo-hooks.js";

function execFileAsync(
  command: string,
  args: string[],
  options: { cwd: string },
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function refExists(repoPath: string, ref: string): Promise<boolean> {
  return execFileAsync("git", ["rev-parse", "--verify", ref], { cwd: repoPath }).then(
    () => true,
    () => false,
  );
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

async function getCurrentBranch(worktreePath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["symbolic-ref", "--short", "-q", "HEAD"], {
      cwd: worktreePath,
    });
    const branch = stdout.trim();
    return branch.length > 0 ? branch : null;
  } catch {
    return null;
  }
}

function resolveWorktreeBranch(
  slug: string,
  startBranch: string | undefined,
  preserveBranchName: boolean | undefined,
): string {
  const generatedBranch = `trace/${slug}`;
  if (preserveBranchName && startBranch && startBranch !== generatedBranch) {
    return startBranch;
  }
  return generatedBranch;
}

export async function createWorktree({
  repoPath,
  repoId,
  sessionId: _sessionId,
  sessionGroupId: _sessionGroupId,
  slug,
  defaultBranch,
  startBranch,
  preserveBranchName,
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
  /** Reuse the persisted branch name instead of generating trace/{slug}. */
  preserveBranchName?: boolean;
  /** Commit SHA to restore from instead of branching from origin/{startBranch|defaultBranch}. */
  checkpointSha?: string;
  /** When enabled for the linked repo, install or repair Trace-managed hooks. */
  gitHooksEnabled?: boolean;
}): Promise<{ workdir: string; branch: string; slug: string }> {
  const sessionsDir = path.join(os.homedir(), "trace", "sessions", repoId);
  const worktreeSlug = slug ?? generateAnimalSlug(await getUsedSlugs(sessionsDir, repoPath));
  const branch = resolveWorktreeBranch(worktreeSlug, startBranch, preserveBranchName);
  const targetPath = path.join(sessionsDir, worktreeSlug);

  // If the worktree directory already exists, reuse it
  if (fs.existsSync(targetPath)) {
    const currentBranch = await getCurrentBranch(targetPath);
    return { workdir: targetPath, branch: currentBranch ?? branch, slug: worktreeSlug };
  }

  // Ensure parent directory exists
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });

  if (checkpointSha) assertValidCommitSha(checkpointSha);

  // Fetch latest so origin refs are up to date
  if (!checkpointSha) {
    await execFileAsync("git", ["fetch", "origin"], { cwd: repoPath });
  } else {
    // Verify the checkpoint SHA is reachable locally; fetch if not
    const reachable = await execFileAsync("git", ["cat-file", "-t", checkpointSha], {
      cwd: repoPath,
    })
      .then(() => true)
      .catch(() => false);
    if (!reachable) {
      await execFileAsync("git", ["fetch", "origin"], { cwd: repoPath });
    }
  }

  // Resolve base branch with fallback chain (remote → local → default)
  const baseRef = checkpointSha ?? (await resolveBaseBranch(repoPath, startBranch, defaultBranch));

  // Check if the branch already exists (e.g. worktree was removed but branch remains)
  const branchExists = await refExists(repoPath, branch);

  if (branchExists) {
    // Reuse existing branch without -b
    await execFileAsync("git", ["worktree", "add", targetPath, branch], { cwd: repoPath });
  } else {
    await execFileAsync("git", ["worktree", "add", "-b", branch, targetPath, baseRef], {
      cwd: repoPath,
    });
  }

  if (gitHooksEnabled) {
    await installOrRepairRepoHooks(targetPath);
  }

  return { workdir: targetPath, branch, slug: worktreeSlug };
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
