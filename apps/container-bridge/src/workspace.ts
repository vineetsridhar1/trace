import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import { generateAnimalSlug, getUsedSlugs } from "@trace/shared/animal-names";
import {
  assertValidCommitSha,
  branchNamesFromGitRefsOutput,
  generatedTraceWorktreeBranch,
  resolveGeneratedTraceWorktreeBranch,
  shouldRepairRenamedTraceWorktreeBranch,
} from "@trace/shared";
import type { BridgeWorkspaceWarning } from "@trace/shared";

const execFileAsync = promisify(execFile);

// True only for real github.com HTTPS remotes — used to gate token injection so
// look-alike hosts (github.com.evil.com) never receive the credential.
function isGitHubHttpsUrl(remoteUrl: string): boolean {
  try {
    const url = new URL(remoteUrl);
    return url.protocol === "https:" && url.hostname.toLowerCase() === "github.com";
  } catch {
    return false;
  }
}

const REPOS_DIR = "/repos";
const WORKSPACES_DIR = process.env.TRACE_WORKSPACES_DIR ?? "/workspaces";

type EnsureRepoResult = {
  repoPath: string;
  warning?: BridgeWorkspaceWarning;
};

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
 * Ensure a repo exists at /repos/{repoId}.
 * Clones if missing, fetches if already present.
 */
export async function ensureRepo(
  repoId: string,
  remoteUrl: string | null,
  branch: string | undefined,
  defaultBranch: string,
): Promise<EnsureRepoResult> {
  const repoPath = `${REPOS_DIR}/${repoId}`;
  if (!remoteUrl) {
    throw new Error("Cloud workspaces require a repo remote URL.");
  }
  const cloneBranch = branch ?? defaultBranch;

  // Inject GitHub token into HTTPS URL for private repo access. Match the host
  // exactly — a substring check would also match `github.com.evil.com`, leaking
  // the org token to an attacker-controlled host.
  let authUrl = remoteUrl;
  const githubToken = process.env.GITHUB_TOKEN;
  if (githubToken && isGitHubHttpsUrl(remoteUrl)) {
    const parsed = new URL(remoteUrl);
    parsed.username = "x-access-token";
    parsed.password = githubToken;
    authUrl = parsed.toString();
  }

  if (fs.existsSync(repoPath)) {
    console.log(`[workspace] fetching ${cloneBranch} for repo ${repoId}`);
    let warning: BridgeWorkspaceWarning | undefined;
    try {
      await fetchBranch(repoPath, cloneBranch);
    } catch (error) {
      if (branch && branch !== defaultBranch && isRemoteBranchMissingError(error, cloneBranch)) {
        console.warn(
          `[workspace] branch ${cloneBranch} was missing on origin; fetching ${defaultBranch} and creating it from base`,
        );
        await fetchBranch(repoPath, defaultBranch);
        await createAndPushMissingBranch(repoPath, cloneBranch, defaultBranch);
        warning = branchMissingWarning(cloneBranch, defaultBranch);
      } else {
        console.warn(
          `[workspace] branch fetch failed for repo ${repoId}, falling back to fetch --all: ${getErrorMessage(error)}`,
        );
        await execFileAsync("git", ["fetch", "--all"], { cwd: repoPath });
      }
    }
    await detachRepoHead(repoPath);
    return { repoPath, warning };
  }

  fs.mkdirSync(REPOS_DIR, { recursive: true });
  console.log(`[workspace] cloning ${remoteUrl} into ${repoPath}`);
  try {
    await cloneRepo(repoId, authUrl, repoPath, cloneBranch);
  } catch (error) {
    if (!branch || branch === defaultBranch || !isRemoteBranchMissingError(error, cloneBranch)) {
      throw error;
    }

    console.warn(
      `[workspace] branch ${cloneBranch} was missing on origin; cloning ${defaultBranch} and creating it from base`,
    );
    fs.rmSync(repoPath, { recursive: true, force: true });
    await cloneRepo(repoId, authUrl, repoPath, defaultBranch);
    await createAndPushMissingBranch(repoPath, cloneBranch, defaultBranch);
    await detachRepoHead(repoPath);
    return {
      repoPath,
      warning: branchMissingWarning(cloneBranch, defaultBranch),
    };
  }
  await detachRepoHead(repoPath);
  return { repoPath };
}

async function cloneRepo(
  repoId: string,
  authUrl: string,
  repoPath: string,
  branch: string,
): Promise<void> {
  await execFileAsync("git", [
    "clone",
    "--filter=blob:none",
    "--no-tags",
    "--single-branch",
    "--branch",
    branch,
    ...repoCacheReferenceArgs(repoId),
    authUrl,
    repoPath,
  ]);
}

async function createAndPushMissingBranch(
  repoPath: string,
  branch: string,
  defaultBranch: string,
): Promise<void> {
  await execFileAsync("git", ["checkout", "-B", branch, `origin/${defaultBranch}`], {
    cwd: repoPath,
  });
  await execFileAsync("git", ["push", "-u", "origin", `HEAD:${branch}`], { cwd: repoPath });
}

function branchMissingWarning(branch: string, baseBranch: string): BridgeWorkspaceWarning {
  return {
    type: "branch_missing_restored_from_base",
    branch,
    baseBranch,
    message:
      `Branch ${branch} did not exist on origin, so Trace created it from ${baseBranch}. ` +
      "Local-only changes from the previous workspace were not restored.",
  };
}

async function detachRepoHead(repoPath: string): Promise<void> {
  await execFileAsync("git", ["checkout", "--detach"], { cwd: repoPath });
}

function repoCacheReferenceArgs(repoId: string): string[] {
  const cacheDir = process.env.TRACE_REPO_CACHE_DIR;
  if (!cacheDir) return [];

  const cachePath = `${cacheDir}/${repoId}.git`;
  return fs.existsSync(cachePath) ? ["--reference-if-able", cachePath] : [];
}

async function fetchBranch(repoPath: string, branch: string): Promise<void> {
  await execFileAsync(
    "git",
    [
      "fetch",
      "--filter=blob:none",
      "--no-tags",
      "origin",
      `+refs/heads/${branch}:refs/remotes/origin/${branch}`,
    ],
    { cwd: repoPath },
  );
}

async function fetchRef(repoPath: string, ref: string): Promise<void> {
  await execFileAsync("git", ["fetch", "--filter=blob:none", "--no-tags", "origin", ref], {
    cwd: repoPath,
  });
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
      try {
        await fetchRef(repoPath, checkpointSha);
      } catch (error) {
        console.warn(
          `[workspace] checkpoint fetch failed for ${checkpointSha}, falling back to fetch --all: ${getErrorMessage(error)}`,
        );
        await execFileAsync("git", ["fetch", "--all"], { cwd: repoPath });
      }
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

export { createAppWorkspace, removeAppWorkspace } from "./app-workspace.js";

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
    return branchNamesFromGitRefsOutput(stdout);
  } catch (error) {
    console.warn(
      `[workspace] failed to list branch refs for namespace check: ${getErrorMessage(error)}`,
    );
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
  return resolveGeneratedTraceWorktreeBranch(slug, refs);
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

function getErrorOutput(error: unknown): string {
  const message = getErrorMessage(error);
  if (!error || typeof error !== "object") return message;
  const stderr = "stderr" in error && typeof error.stderr === "string" ? error.stderr : "";
  const stdout = "stdout" in error && typeof error.stdout === "string" ? error.stdout : "";
  return `${message}\n${stderr}\n${stdout}`;
}

function isRemoteBranchMissingError(error: unknown, branch: string): boolean {
  const output = getErrorOutput(error);
  return (
    output.includes(`Remote branch ${branch} not found`) ||
    output.includes(`Could not find remote branch ${branch} to clone`) ||
    output.includes(`couldn't find remote ref refs/heads/${branch}`) ||
    output.includes(`couldn't find remote ref ${branch}`)
  );
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
  // Upstream tracking is cosmetic for an ephemeral worktree (Trace pushes
  // explicitly), so a failure here must never abort workspace bootstrap.
  try {
    await ensureRemoteTracksBranch(repoPath, baseRef.slice("origin/".length));
    await execFileAsync("git", ["branch", "--set-upstream-to", baseRef, branch], { cwd: repoPath });
  } catch (error) {
    console.warn(
      `[workspace] failed to set upstream for ${branch} -> ${baseRef}: ${getErrorMessage(error)}`,
    );
  }
}

/**
 * Ensure `remote.origin.fetch` covers `branch` so upstream tracking resolves.
 *
 * A `--single-branch` clone only writes a fetch refspec for its clone branch, so
 * a branch fetched ad-hoc by {@link fetchBranch} exists as a remote-tracking ref
 * yet isn't reverse-mappable through the configured refspec. Both
 * `git branch --set-upstream-to` and `@{upstream}` reject such a ref
 * ("cannot set up tracking information; starting point '...' is not a branch").
 * Registering the one branch keeps fetches scoped to the branches we actually
 * work on — no wildcard, no pulling every branch — while making tracking work.
 *
 * No fetch is needed here: callers only reach this for an `origin/<branch>`
 * baseRef, which `resolveBaseRef` returns only after confirming the
 * remote-tracking ref already exists locally.
 */
async function ensureRemoteTracksBranch(repoPath: string, branch: string): Promise<void> {
  const desired = `+refs/heads/${branch}:refs/remotes/origin/${branch}`;
  const wildcard = "+refs/heads/*:refs/remotes/origin/*";
  const result = await execFileAsync("git", ["config", "--get-all", "remote.origin.fetch"], {
    cwd: repoPath,
  }).catch(() => null);
  // Conservative exact-string match: a non-canonical covering refspec (e.g. a
  // narrower wildcard) would just add a redundant entry, which git dedupes.
  const refspecs = (result?.stdout ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (refspecs.includes(desired) || refspecs.includes(wildcard)) return;
  await execFileAsync("git", ["remote", "set-branches", "--add", "origin", branch], {
    cwd: repoPath,
  });
}

/**
 * Remove a worktree for a deleted session.
 */
export async function removeWorktree(repoId: string, worktreePath: string): Promise<void> {
  const repoPath = `${REPOS_DIR}/${repoId}`;
  if (!fs.existsSync(repoPath)) return;
  await execFileAsync("git", ["worktree", "remove", worktreePath, "--force"], { cwd: repoPath });
}
