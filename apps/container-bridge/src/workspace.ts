import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import { assertValidCommitSha } from "@trace/shared";

const execFileAsync = promisify(execFile);

const REPOS_DIR = "/repos";
const WORKSPACES_DIR = "/workspaces";

/** Get the local path for a repo by ID. Returns undefined if not cloned yet. */
export function getRepoPath(repoId: string): string | undefined {
  const p = `${REPOS_DIR}/${repoId}`;
  return fs.existsSync(p) ? p : undefined;
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
 * The worktree is keyed by `sessionGroupId` when provided so that all sessions
 * in the same group share a single worktree and branch. Falls back to `sessionId`.
 */
export async function createWorktree(
  repoId: string,
  sessionId: string,
  defaultBranch: string,
  branch?: string,
  checkpointSha?: string,
  sessionGroupId?: string,
): Promise<{ workdir: string }> {
  const worktreeKey = sessionGroupId ?? sessionId;
  const repoPath = `${REPOS_DIR}/${repoId}`;
  const worktreePath = `${WORKSPACES_DIR}/${worktreeKey}`;

  // If worktree already exists, reuse it
  if (fs.existsSync(worktreePath)) {
    return { workdir: worktreePath };
  }

  fs.mkdirSync(WORKSPACES_DIR, { recursive: true });

  if (checkpointSha) assertValidCommitSha(checkpointSha);

  const branchName = `trace/${worktreeKey}`;
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

  // Check if the branch already exists
  const branchExists = await execFileAsync(
    "git", ["rev-parse", "--verify", branchName],
    { cwd: repoPath },
  ).then(() => true, () => false);

  if (branchExists) {
    await execFileAsync("git", ["worktree", "add", worktreePath, branchName], { cwd: repoPath });
  } else {
    await execFileAsync("git", ["worktree", "add", "-b", branchName, worktreePath, baseRef], { cwd: repoPath });
  }

  return { workdir: worktreePath };
}

/**
 * Remove a worktree for a deleted session.
 */
export async function removeWorktree(repoId: string, worktreePath: string): Promise<void> {
  const repoPath = `${REPOS_DIR}/${repoId}`;
  if (!fs.existsSync(repoPath)) return;
  await execFileAsync("git", ["worktree", "remove", worktreePath, "--force"], { cwd: repoPath });
}
