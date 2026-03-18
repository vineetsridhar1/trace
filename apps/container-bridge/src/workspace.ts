import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";

const execFileAsync = promisify(execFile);

const REPOS_DIR = "/repos";
const WORKSPACES_DIR = "/workspaces";

/**
 * Ensure a bare repo exists at /repos/{repoId}.
 * Clones if missing, fetches if already present.
 */
export async function ensureRepo(repoId: string, remoteUrl: string): Promise<string> {
  const repoPath = `${REPOS_DIR}/${repoId}`;

  // Convert SSH URLs to HTTPS so we can inject a token (containers don't have SSH)
  let authUrl = remoteUrl;
  const sshMatch = remoteUrl.match(/^git@github\.com:(.+?)(?:\.git)?$/);
  if (sshMatch) {
    authUrl = `https://github.com/${sshMatch[1]}.git`;
  }

  // Inject GitHub token into HTTPS URL for private repo access
  const githubToken = process.env.GITHUB_TOKEN;
  if (githubToken && authUrl.startsWith("https://github.com")) {
    authUrl = authUrl.replace("https://github.com", `https://x-access-token:${githubToken}@github.com`);
  }

  if (fs.existsSync(repoPath)) {
    // Repo already cloned — ensure remote uses auth URL, then fetch latest
    console.log(`[workspace] fetching latest for repo ${repoId}`);
    await execFileAsync("git", ["remote", "set-url", "origin", authUrl], { cwd: repoPath });
    await execFileAsync("git", ["fetch", "--all"], { cwd: repoPath });
    return repoPath;
  }

  // Clone the repo (bare-ish: we use worktrees for actual working copies)
  fs.mkdirSync(REPOS_DIR, { recursive: true });
  console.log(`[workspace] cloning ${remoteUrl} into ${repoPath}`);
  await execFileAsync("git", ["clone", authUrl, repoPath]);

  // Update the stored remote URL to the auth URL so subsequent git operations
  // (push, fetch) from within worktrees use HTTPS+token instead of SSH.
  await execFileAsync("git", ["remote", "set-url", "origin", authUrl], { cwd: repoPath });

  return repoPath;
}

/**
 * Create a worktree at /workspaces/{sessionId} from the repo at /repos/{repoId}.
 */
export async function createWorktree(
  repoId: string,
  sessionId: string,
  defaultBranch: string,
  branch?: string,
): Promise<{ workdir: string }> {
  const repoPath = `${REPOS_DIR}/${repoId}`;
  const worktreePath = `${WORKSPACES_DIR}/${sessionId}`;

  // If worktree already exists, reuse it
  if (fs.existsSync(worktreePath)) {
    return { workdir: worktreePath };
  }

  fs.mkdirSync(WORKSPACES_DIR, { recursive: true });

  const branchName = `trace/${sessionId}`;
  const baseBranch = branch ?? defaultBranch;

  // Check if the branch already exists
  const branchExists = await execFileAsync(
    "git", ["rev-parse", "--verify", branchName],
    { cwd: repoPath },
  ).then(() => true, () => false);

  if (branchExists) {
    await execFileAsync("git", ["worktree", "add", worktreePath, branchName], { cwd: repoPath });
  } else {
    await execFileAsync("git", ["worktree", "add", "-b", branchName, worktreePath, baseBranch], { cwd: repoPath });
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
