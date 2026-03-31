import path from "path";
import os from "os";
import fs from "fs";
import { execFile } from "child_process";
import { promisify } from "util";
import { assertValidCommitSha, generateAnimalSlug } from "@trace/shared";
import { installOrRepairRepoHooks } from "./repo-hooks.js";

const execFileAsync = promisify(execFile);

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

/** Collect slugs already in use for a given repo (from directories and git branches). */
async function getUsedSlugs(repoPath: string, repoId: string): Promise<Set<string>> {
  const used = new Set<string>();

  // 1. Existing directory names in ~/trace/sessions/{repoId}/
  const sessionsDir = path.join(os.homedir(), "trace", "sessions", repoId);
  if (fs.existsSync(sessionsDir)) {
    for (const entry of fs.readdirSync(sessionsDir)) {
      used.add(entry);
    }
  }

  // 2. Existing trace/* branch names
  try {
    const { stdout } = await execFileAsync("git", ["branch", "--list", "trace/*", "--format=%(refname:short)"], { cwd: repoPath });
    for (const line of stdout.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("trace/")) {
        used.add(trimmed.slice("trace/".length));
      }
    }
  } catch {
    // If git command fails, proceed with just directory-based slugs
  }

  return used;
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
  const worktreeSlug = slug ?? generateAnimalSlug(await getUsedSlugs(repoPath, repoId));
  const branch = `trace/${worktreeSlug}`;
  const targetPath = path.join(os.homedir(), "trace", "sessions", repoId, worktreeSlug);

  // If the worktree directory already exists, reuse it
  if (fs.existsSync(targetPath)) {
    return { workdir: targetPath, branch, slug: worktreeSlug };
  }

  // Ensure parent directory exists
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });

  if (checkpointSha) assertValidCommitSha(checkpointSha);

  // Fetch latest so origin refs are up to date
  if (!checkpointSha) {
    await execFileAsync("git", ["fetch", "origin"], { cwd: repoPath });
  } else {
    // Verify the checkpoint SHA is reachable locally; fetch if not
    const reachable = await execFileAsync("git", ["cat-file", "-t", checkpointSha], { cwd: repoPath })
      .then(() => true)
      .catch(() => false);
    if (!reachable) {
      await execFileAsync("git", ["fetch", "origin"], { cwd: repoPath });
    }
  }

  // Resolve base branch with fallback chain (remote → local → default)
  const baseRef = checkpointSha
    ?? await resolveBaseBranch(repoPath, startBranch, defaultBranch);

  // Check if the branch already exists (e.g. worktree was removed but branch remains)
  const branchExists = await refExists(repoPath, branch);

  if (branchExists) {
    // Reuse existing branch without -b
    await execFileAsync(
      "git",
      ["worktree", "add", targetPath, branch],
      { cwd: repoPath },
    );
  } else {
    await execFileAsync(
      "git",
      ["worktree", "add", "-b", branch, targetPath, baseRef],
      { cwd: repoPath },
    );
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
