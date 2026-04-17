import path from "path";
import os from "os";
import fs from "fs";
import { execFile } from "child_process";
import { promisify } from "util";
import { generateAnimalSlug, getUsedSlugs } from "@trace/shared/animal-names";
import { assertValidCommitSha } from "@trace/shared";
import { installOrRepairRepoHooks } from "./repo-hooks.js";

const execFileAsync = promisify(execFile);
const MIRRORED_ENV_FILES = [
  ".env",
  ".env.local",
  ".env.development",
  ".env.development.local",
  ".env.test",
  ".env.test.local",
  ".env.production",
  ".env.production.local",
];
const WORKTREE_SYNC_IGNORE = new Set([
  ".git",
  "dist",
  "build",
  ".next",
  ".turbo",
  ".cache",
  "__pycache__",
  ".venv",
]);

function syncRootEnvFiles(sourceRepoPath: string, targetPath: string): void {
  for (const fileName of MIRRORED_ENV_FILES) {
    const sourcePath = path.join(sourceRepoPath, fileName);
    const destinationPath = path.join(targetPath, fileName);
    if (!fs.existsSync(sourcePath) || fs.existsSync(destinationPath)) {
      continue;
    }
    fs.copyFileSync(sourcePath, destinationPath);
  }
}

function collectNodeModulesDirs(rootPath: string, currentPath = rootPath, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (WORKTREE_SYNC_IGNORE.has(entry.name)) continue;

    const fullPath = path.join(currentPath, entry.name);
    const relativePath = path.relative(rootPath, fullPath);

    if (entry.name === "node_modules") {
      acc.push(relativePath);
      continue;
    }

    collectNodeModulesDirs(rootPath, fullPath, acc);
  }

  return acc;
}

function symlinkDirectory(sourcePath: string, destinationPath: string): void {
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.symlinkSync(sourcePath, destinationPath, process.platform === "win32" ? "junction" : "dir");
}

function syncWorkspaceDependencies(sourceRepoPath: string, targetPath: string): void {
  for (const relativePath of collectNodeModulesDirs(sourceRepoPath)) {
    const sourcePath = path.join(sourceRepoPath, relativePath);
    const destinationPath = path.join(targetPath, relativePath);
    if (!fs.existsSync(sourcePath) || fs.existsSync(destinationPath)) {
      continue;
    }
    symlinkDirectory(sourcePath, destinationPath);
  }
}

function syncWorktreeArtifacts(sourceRepoPath: string, targetPath: string): void {
  syncRootEnvFiles(sourceRepoPath, targetPath);
  syncWorkspaceDependencies(sourceRepoPath, targetPath);
}

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
  const worktreeSlug = slug ?? generateAnimalSlug(await getUsedSlugs(sessionsDir, repoPath));
  const branch = `trace/${worktreeSlug}`;
  const targetPath = path.join(sessionsDir, worktreeSlug);

  // If the worktree directory already exists, reuse it
  if (fs.existsSync(targetPath)) {
    syncWorktreeArtifacts(repoPath, targetPath);
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

  syncWorktreeArtifacts(repoPath, targetPath);

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
