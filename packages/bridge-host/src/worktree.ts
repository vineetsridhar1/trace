import path from "path";
import os from "os";
import fs from "fs";
import { execFile } from "child_process";
import { generateAnimalSlug, getUsedSlugs } from "@trace/shared/animal-names";
import {
  assertValidCommitSha,
  branchNamesFromGitRefsOutput,
  generatedTraceWorktreeBranch,
  resolveGeneratedTraceWorktreeBranch,
  shouldRepairRenamedTraceWorktreeBranch,
} from "@trace/shared";
import { installOrRepairRepoHooksBestEffort } from "./repo-hooks.js";
import { formatGitError, gitEnv } from "./git-utils.js";

type ExecErrorWithOutput = Error & {
  stdout?: string;
  stderr?: string;
};

function execFileAsync(
  command: string,
  args: string[],
  options: { cwd: string },
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { ...options, env: gitEnv() }, (error, stdout, stderr) => {
      if (error) {
        const gitError = error as ExecErrorWithOutput;
        if (typeof stdout === "string") gitError.stdout = stdout;
        if (typeof stderr === "string") gitError.stderr = stderr;
        reject(new Error(formatGitError(gitError)));
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

  // 3. Safe fallback to repo's default branch, remote first, then local.
  const remoteDefault = `origin/${defaultBranch}`;
  if (await refExists(repoPath, remoteDefault)) return remoteDefault;
  if (await refExists(repoPath, defaultBranch)) return defaultBranch;

  return "HEAD";
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

async function resetWorktreeToRef(worktreePath: string, ref: string): Promise<void> {
  await execFileAsync("git", ["reset", "--hard", ref], { cwd: worktreePath });
  await execFileAsync("git", ["clean", "-ffdx"], { cwd: worktreePath });
}

async function switchWorktreeToBranch(
  worktreePath: string,
  branch: string,
  baseRef: string | null,
): Promise<void> {
  await execFileAsync("git", ["checkout", "-f", "-B", branch, ...(baseRef ? [baseRef] : [])], {
    cwd: worktreePath,
  });
}

async function isUsableWorktree(worktreePath: string): Promise<boolean> {
  return execFileAsync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: worktreePath }).then(
    ({ stdout }) => stdout.trim() === "true",
    () => false,
  );
}

function getErrorMessage(error: unknown): string {
  return formatGitError(error);
}

async function addWorktree(repoPath: string, worktreePath: string, args: string[]): Promise<void> {
  try {
    await execFileAsync("git", ["worktree", "add", ...args], { cwd: repoPath });
  } catch (error) {
    if (await isUsableWorktree(worktreePath)) {
      console.warn(
        `[worktree] git worktree add reported an error after creating ${worktreePath}: ${getErrorMessage(error)}`,
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

async function hasRemoteOrigin(repoPath: string): Promise<boolean> {
  return execFileAsync("git", ["remote", "get-url", "origin"], { cwd: repoPath }).then(
    () => true,
    () => false,
  );
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
      `[worktree] failed to list branch refs for namespace check: ${getErrorMessage(error)}`,
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

async function resolveAvailableWorktreeSlug(
  sessionsDir: string,
  repoPath: string,
  requestedSlug: string | undefined,
): Promise<string> {
  if (requestedSlug) return requestedSlug;
  const usedSlugs = await getUsedSlugs(sessionsDir, repoPath);
  return generateAnimalSlug(usedSlugs);
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
  /** Reuse the persisted branch name instead of generating trace-{slug}. */
  preserveBranchName?: boolean;
  /** Commit SHA to restore from instead of branching from origin/{startBranch|defaultBranch}. */
  checkpointSha?: string;
  /** When enabled for the linked repo, install or repair Trace-managed hooks. */
  gitHooksEnabled?: boolean;
}): Promise<{ workdir: string; branch: string; slug: string }> {
  const sessionsDir = path.join(os.homedir(), "trace", "sessions", repoId);
  const worktreeSlug = await resolveAvailableWorktreeSlug(sessionsDir, repoPath, slug);
  const targetPath = path.join(sessionsDir, worktreeSlug);

  // Ensure parent directory exists
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });

  if (checkpointSha) assertValidCommitSha(checkpointSha);

  const hasOrigin = await hasRemoteOrigin(repoPath);

  // Fetch latest so origin refs are up to date when a remote exists.
  if (!checkpointSha) {
    if (hasOrigin) await execFileAsync("git", ["fetch", "origin"], { cwd: repoPath });
  } else {
    // Verify the checkpoint SHA is reachable locally; fetch if not
    const reachable = await execFileAsync("git", ["cat-file", "-t", checkpointSha], {
      cwd: repoPath,
    })
      .then(() => true)
      .catch(() => false);
    if (!reachable && hasOrigin) {
      await execFileAsync("git", ["fetch", "origin"], { cwd: repoPath });
    }
  }

  // Resolve base branch with fallback chain (remote → local → default)
  const resolvedBaseRef =
    checkpointSha ?? (await resolveBaseBranch(repoPath, startBranch, defaultBranch));
  const baseRef =
    resolvedBaseRef === "HEAD" && !(await refExists(repoPath, "HEAD")) ? null : resolvedBaseRef;
  const branch = await resolveWorktreeBranch(
    repoPath,
    worktreeSlug,
    startBranch,
    preserveBranchName,
  );

  // If the worktree directory already exists, reuse the stable slug path.
  // Trace-owned branches can still be reset to the requested remote/checkpoint
  // state; non-matching user branches are reported back as the actual workspace
  // branch so the server can reconcile instead of blocking the UI.
  if (fs.existsSync(targetPath)) {
    const currentBranch = await getCurrentBranch(targetPath);
    if (currentBranch !== branch) {
      const canRepairRenamedBranch = shouldRepairRenamedTraceWorktreeBranch({
        currentBranch,
        requestedBranch: branch,
        persistedBranch: startBranch,
        preserveBranchName,
      });
      if (!canRepairRenamedBranch) {
        if (currentBranch) {
          console.warn(
            `[worktree] reconciling existing Trace worktree ${targetPath}: expected ${branch}, found ${currentBranch}`,
          );
          if (gitHooksEnabled) {
            await installOrRepairRepoHooksBestEffort(targetPath, "session worktree reuse");
          }
          return { workdir: targetPath, branch: currentBranch, slug: worktreeSlug };
        }
        throw new Error(
          `Existing session worktree ${targetPath} is detached, expected ${branch}. ` +
            "Switch it back to a branch or remove the worktree before retrying.",
        );
      }
      console.warn(
        `[worktree] repairing renamed Trace worktree ${targetPath}: ${currentBranch} -> ${branch}`,
      );
      await switchWorktreeToBranch(targetPath, branch, baseRef);
    }
    if (baseRef) {
      await resetWorktreeToRef(targetPath, baseRef);
      await setUpstreamIfRemote(repoPath, branch, baseRef);
    }
    return { workdir: targetPath, branch, slug: worktreeSlug };
  }

  // Check if the branch already exists (e.g. worktree was removed but branch remains)
  const branchExists = await refExists(repoPath, branch);

  if (branchExists) {
    // Reuse existing branch without -b
    await addWorktree(repoPath, targetPath, [targetPath, branch]);
  } else if (!baseRef) {
    await addWorktree(repoPath, targetPath, ["--orphan", "-b", branch, targetPath]);
  } else {
    await addWorktree(repoPath, targetPath, ["-b", branch, targetPath, baseRef]);
  }
  if (baseRef) {
    await resetWorktreeToRef(targetPath, baseRef);
    await setUpstreamIfRemote(repoPath, branch, baseRef);
  }

  if (gitHooksEnabled) {
    await installOrRepairRepoHooksBestEffort(targetPath, "session worktree creation");
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
