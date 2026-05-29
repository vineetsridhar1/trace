import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import { generateAnimalSlug, getUsedSlugs } from "@trace/shared/animal-names";
import {
  assertValidCommitSha,
  generatedTraceWorktreeBranch,
  hasGitRefNamespaceConflict,
  shouldRepairRenamedTraceWorktreeBranch,
} from "@trace/shared";

const execFileAsync = promisify(execFile);

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

/**
 * Ensure a bare repo exists at /repos/{repoId}.
 * Clones if missing, fetches if already present.
 */
export async function ensureRepo(repoId: string, remoteUrl: string | null): Promise<string> {
  const repoPath = `${REPOS_DIR}/${repoId}`;
  if (!remoteUrl) {
    throw new Error("Cloud workspaces require a repo remote URL.");
  }

  // Inject GitHub token into HTTPS URL for private repo access
  let authUrl = remoteUrl;
  const githubToken = process.env.GITHUB_TOKEN;
  if (githubToken && remoteUrl.startsWith("https://github.com")) {
    authUrl = remoteUrl.replace(
      "https://github.com",
      `https://x-access-token:${githubToken}@github.com`,
    );
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

export async function getWorkspaceSlugs(repoId: string): Promise<Set<string>> {
  const repoPath = `${REPOS_DIR}/${repoId}`;
  return getUsedSlugs(WORKSPACES_DIR, repoPath);
}

async function resolveAvailableWorkspaceSlug(
  repoPath: string,
  requestedSlug: string | undefined,
): Promise<string> {
  if (requestedSlug) return requestedSlug;
  const usedSlugs = await getUsedSlugs(WORKSPACES_DIR, repoPath);
  return generateAnimalSlug(usedSlugs);
}

async function refExists(repoPath: string, ref: string): Promise<boolean> {
  return execFileAsync("git", ["rev-parse", "--verify", ref], { cwd: repoPath }).then(
    () => true,
    () => false,
  );
}

async function resolveBaseRef(
  repoPath: string,
  branch: string | undefined,
  defaultBranch: string,
): Promise<string> {
  const candidate = branch ?? defaultBranch;
  const remote = `origin/${candidate}`;
  if (await refExists(repoPath, remote)) return remote;
  if (await refExists(repoPath, candidate)) return candidate;

  const remoteDefault = `origin/${defaultBranch}`;
  if (await refExists(repoPath, remoteDefault)) return remoteDefault;
  if (await refExists(repoPath, defaultBranch)) return defaultBranch;

  return "HEAD";
}

/**
 * Create a worktree from the repo at /repos/{repoId}.
 * The worktree is keyed by `slug` (an animal name) when provided.
 * Falls back to generating a new animal slug.
 */
export async function createWorktree({
  repoId,
  sessionId: _sessionId,
  defaultBranch,
  branch,
  preserveBranchName,
  checkpointSha,
  sessionGroupId: _sessionGroupId,
  slug,
}: {
  repoId: string;
  sessionId: string;
  defaultBranch: string;
  branch?: string;
  /** Reuse the persisted branch name instead of generating trace-{slug}. */
  preserveBranchName?: boolean;
  checkpointSha?: string;
  /** When set, the worktree and branch are keyed by this ID so all sessions in the group share the same workspace. */
  sessionGroupId?: string;
  /** Pre-assigned animal slug. If absent, one is generated. */
  slug?: string;
}): Promise<{ workdir: string; branch: string; slug: string }> {
  const repoPath = `${REPOS_DIR}/${repoId}`;
  const worktreeSlug = await resolveAvailableWorkspaceSlug(repoPath, slug);
  const worktreePath = `${WORKSPACES_DIR}/${worktreeSlug}`;

  fs.mkdirSync(WORKSPACES_DIR, { recursive: true });

  if (checkpointSha) assertValidCommitSha(checkpointSha);

  const baseRef = checkpointSha ?? (await resolveBaseRef(repoPath, branch, defaultBranch));
  const branchName = await resolveWorktreeBranch(
    repoPath,
    worktreeSlug,
    branch,
    preserveBranchName,
  );

  // When restoring a checkpoint, verify the SHA is locally reachable; fetch if not
  if (checkpointSha) {
    const reachable = await execFileAsync("git", ["cat-file", "-t", checkpointSha], {
      cwd: repoPath,
    })
      .then(() => true)
      .catch(() => false);
    if (!reachable) {
      await execFileAsync("git", ["fetch", "--all"], { cwd: repoPath });
    }
  }

  if (fs.existsSync(worktreePath)) {
    const currentBranch = await getCurrentBranch(worktreePath);
    if (currentBranch !== branchName) {
      const canRepairRenamedBranch = shouldRepairRenamedTraceWorktreeBranch({
        currentBranch,
        requestedBranch: branchName,
        persistedBranch: branch,
        preserveBranchName,
      });
      if (!canRepairRenamedBranch) {
        throw new Error(
          `Existing workspace ${worktreePath} is on branch ${currentBranch ?? "detached HEAD"}, expected ${branchName}. ` +
            "Switch it back or remove the workspace before retrying.",
        );
      }
      console.warn(
        `[workspace] repairing renamed Trace worktree ${worktreePath}: ${currentBranch} -> ${branchName}`,
      );
      await switchWorktreeToBranch(worktreePath, branchName, baseRef);
    }
    await resetWorktreeToRef(worktreePath, baseRef);
    await setUpstreamIfRemote(repoPath, branchName, baseRef);
    return { workdir: worktreePath, branch: branchName, slug: worktreeSlug };
  }

  // Check if the branch already exists
  const branchExists = await execFileAsync("git", ["rev-parse", "--verify", branchName], {
    cwd: repoPath,
  }).then(
    () => true,
    () => false,
  );

  if (branchExists) {
    await addWorktree(repoPath, worktreePath, [worktreePath, branchName]);
  } else {
    await addWorktree(repoPath, worktreePath, ["-b", branchName, worktreePath, baseRef]);
  }
  await resetWorktreeToRef(worktreePath, baseRef);
  await setUpstreamIfRemote(repoPath, branchName, baseRef);

  return { workdir: worktreePath, branch: branchName, slug: worktreeSlug };
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

async function listBranchRefs(repoPath: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["for-each-ref", "--format=%(refname)", "refs/heads", "refs/remotes"],
      { cwd: repoPath },
    );
    return stdout
      .split("\n")
      .map((line) => {
        const ref = line.trim();
        if (ref.startsWith("refs/heads/")) return ref.slice("refs/heads/".length);
        if (ref.startsWith("refs/remotes/")) {
          const remoteBranch = ref.slice("refs/remotes/".length);
          const separatorIndex = remoteBranch.indexOf("/");
          if (separatorIndex === -1) return null;
          const branch = remoteBranch.slice(separatorIndex + 1);
          return branch === "HEAD" ? null : branch;
        }
        return null;
      })
      .filter((resolvedBranch): resolvedBranch is string => !!resolvedBranch);
  } catch {
    return [];
  }
}

async function resolveWorktreeBranch(
  repoPath: string,
  slug: string,
  startBranch: string | undefined,
  preserveBranchName: boolean | undefined,
): Promise<string> {
  const generatedBranch = generatedTraceWorktreeBranch(slug);
  if (preserveBranchName && startBranch && startBranch !== generatedBranch) {
    return startBranch;
  }
  const refs = await listBranchRefs(repoPath);
  if (!hasGitRefNamespaceConflict(generatedBranch, refs)) return generatedBranch;

  for (let i = 2; i <= 999; i++) {
    const candidate = `${generatedBranch}-${i}`;
    if (!hasGitRefNamespaceConflict(candidate, refs)) return candidate;
  }

  return `${generatedBranch}-${Date.now()}`;
}

async function resetWorktreeToRef(worktreePath: string, ref: string): Promise<void> {
  // Provisioned containers are treated as recoverable from Trace state plus
  // origin/checkpoint state. Do not trust stale disk contents when a runtime is
  // reprovisioned or a container is reused.
  await execFileAsync("git", ["reset", "--hard", ref], { cwd: worktreePath });
  await execFileAsync("git", ["clean", "-ffdx"], { cwd: worktreePath });
}

async function switchWorktreeToBranch(
  worktreePath: string,
  branch: string,
  baseRef: string,
): Promise<void> {
  await execFileAsync("git", ["checkout", "-f", "-B", branch, baseRef], { cwd: worktreePath });
}

async function isUsableWorktree(worktreePath: string): Promise<boolean> {
  return execFileAsync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: worktreePath }).then(
    ({ stdout }) => stdout.trim() === "true",
    () => false,
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function addWorktree(repoPath: string, worktreePath: string, args: string[]): Promise<void> {
  try {
    await execFileAsync("git", ["worktree", "add", ...args], { cwd: repoPath });
  } catch (error) {
    if (await isUsableWorktree(worktreePath)) {
      console.warn(
        `[workspace] git worktree add reported an error after creating ${worktreePath}: ${getErrorMessage(error)}`,
      );
      return;
    }
    throw error;
  }
}

async function setUpstreamIfRemote(
  repoPath: string,
  branch: string | null,
  baseRef: string,
): Promise<void> {
  if (!branch || !baseRef.startsWith("origin/")) return;
  await execFileAsync("git", ["branch", "--set-upstream-to", baseRef, branch], { cwd: repoPath });
}

/**
 * Remove a worktree for a deleted session.
 */
export async function removeWorktree(repoId: string, worktreePath: string): Promise<void> {
  const repoPath = `${REPOS_DIR}/${repoId}`;
  if (!fs.existsSync(repoPath)) return;
  await execFileAsync("git", ["worktree", "remove", worktreePath, "--force"], { cwd: repoPath });
}
