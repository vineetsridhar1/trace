import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import { generateAnimalSlug, getUsedSlugs } from "@trace/shared/animal-names";
import { assertValidCommitSha } from "@trace/shared";

const execFileAsync = promisify(execFile);
const MAX_AUTO_SLUG_ATTEMPTS = 25;

type GitExecError = Error & {
  stderr?: string;
  stdout?: string;
};

const REPOS_DIR = "/repos";
const WORKSPACES_DIR = "/workspaces";

/** Get the local path for a repo by ID. Returns undefined if not cloned yet. */
export function getRepoPath(repoId: string): string | undefined {
  const p = `${REPOS_DIR}/${repoId}`;
  return fs.existsSync(p) ? p : undefined;
}

/** List repoIds that are already cloned on disk at /repos/{repoId}. */
export function listClonedRepoIds(): string[] {
  if (!fs.existsSync(REPOS_DIR)) return [];
  return fs
    .readdirSync(REPOS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(`${REPOS_DIR}/${entry.name}/.git`))
    .map((entry) => entry.name);
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

/**
 * Ensure a bare repo exists at /repos/{repoId}.
 * Clones if missing, fetches if already present.
 */
export async function ensureRepo(repoId: string, remoteUrl: string): Promise<string> {
  const repoPath = `${REPOS_DIR}/${repoId}`;

  // Inject GitHub token into HTTPS URL for private repo access
  let authUrl = remoteUrl;
  const githubToken = process.env.GITHUB_TOKEN;
  if (githubToken && remoteUrl.startsWith("https://github.com")) {
    authUrl = remoteUrl.replace("https://github.com", `https://x-access-token:${githubToken}@github.com`);
  }

  if (fs.existsSync(repoPath)) {
    // Repo already cloned — fetch latest
    console.log(`[workspace] fetching latest for repo ${repoId}`);
    await execFileAsync("git", ["fetch", "--all"], { cwd: repoPath });
    return repoPath;
  }

  // Clone the repo (bare-ish: we use worktrees for actual working copies)
  fs.mkdirSync(REPOS_DIR, { recursive: true });
  console.log(`[workspace] cloning ${remoteUrl} into ${repoPath}`);
  await execFileAsync("git", ["clone", authUrl, repoPath]);
  return repoPath;
}

/**
 * Create a worktree from the repo at /repos/{repoId}.
 * The worktree is keyed by `slug` (an animal name) when provided.
 * Falls back to generating a new animal slug.
 */
export async function createWorktree({
  repoId,
  sessionId,
  defaultBranch,
  branch,
  checkpointSha,
  sessionGroupId,
  slug,
}: {
  repoId: string;
  sessionId: string;
  defaultBranch: string;
  branch?: string;
  checkpointSha?: string;
  /** When set, the worktree and branch are keyed by this ID so all sessions in the group share the same workspace. */
  sessionGroupId?: string;
  /** Pre-assigned animal slug. If absent, one is generated. */
  slug?: string;
}): Promise<{ workdir: string; slug: string }> {
  const repoPath = `${REPOS_DIR}/${repoId}`;
  const shouldRetryCollisions = !slug;

  fs.mkdirSync(WORKSPACES_DIR, { recursive: true });

  if (checkpointSha) assertValidCommitSha(checkpointSha);
  const baseRef = checkpointSha ?? `origin/${branch ?? defaultBranch}`;

  // When restoring a checkpoint, verify the SHA is locally reachable; fetch if not
  if (checkpointSha) {
    const reachable = await execFileAsync("git", ["cat-file", "-t", checkpointSha], { cwd: repoPath })
      .then(() => true)
      .catch(() => false);
    if (!reachable) {
      await execFileAsync("git", ["fetch", "--all"], { cwd: repoPath });
    }
  }
  const usedSlugs = shouldRetryCollisions ? await getUsedSlugs(WORKSPACES_DIR, repoPath) : null;

  for (let attempt = 0; attempt < MAX_AUTO_SLUG_ATTEMPTS; attempt += 1) {
    const worktreeSlug = slug ?? generateAnimalSlug(usedSlugs ?? new Set<string>());
    const worktreePath = `${WORKSPACES_DIR}/${worktreeSlug}`;
    const branchName = `trace/${worktreeSlug}`;

    // If worktree already exists, only reuse it for an explicitly assigned slug.
    if (fs.existsSync(worktreePath)) {
      if (!shouldRetryCollisions) {
        return { workdir: worktreePath, slug: worktreeSlug };
      }
      usedSlugs?.add(worktreeSlug);
      continue;
    }

    // Reuse explicit branch names, but retry auto-generated collisions.
    const branchExists = await execFileAsync(
      "git", ["rev-parse", "--verify", branchName],
      { cwd: repoPath },
    ).then(() => true, () => false);
    if (branchExists) {
      if (!shouldRetryCollisions) {
        await execFileAsync("git", ["worktree", "add", worktreePath, branchName], { cwd: repoPath });
        return { workdir: worktreePath, slug: worktreeSlug };
      }
      usedSlugs?.add(worktreeSlug);
      continue;
    }

    try {
      await execFileAsync("git", ["worktree", "add", "-b", branchName, worktreePath, baseRef], { cwd: repoPath });
    } catch (error) {
      if (shouldRetryCollisions && isWorktreeCollisionError(error, branchName, worktreePath)) {
        usedSlugs?.add(worktreeSlug);
        continue;
      }
      throw error;
    }

    return { workdir: worktreePath, slug: worktreeSlug };
  }

  throw new Error("Failed to allocate a unique worktree slug after repeated collisions");
}

/**
 * Remove a worktree for a deleted session.
 */
export async function removeWorktree(repoId: string, worktreePath: string): Promise<void> {
  const repoPath = `${REPOS_DIR}/${repoId}`;
  if (!fs.existsSync(repoPath)) return;
  await execFileAsync("git", ["worktree", "remove", worktreePath, "--force"], { cwd: repoPath });
}
