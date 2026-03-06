import path from "node:path";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { runProcess } from "./process";
import {
  runStateByWorkspaceId,
  stopWatchdog,
  appendAgentDebugLog,
} from "./watchdog";

export const runningProcesses = new Map<
  string,
  import("node:child_process").ChildProcess
>();
export const suppressSyntheticStopFor = new Set<string>();

let worktreeBase = "";

export function setWorktreeBase(dir: string) {
  worktreeBase = dir;
}

export function getWorktreeBase(): string {
  return worktreeBase;
}

export function getWorktreePath(workspaceId: string): string {
  return path.join(getWorktreeBase(), workspaceId);
}

function getBaseShaConfigKey(workspaceId: string): string {
  return `trace.base-sha-msg-${workspaceId}`;
}

export interface EnsureWorktreeResult {
  worktreePath: string;
  created: boolean;
}

export async function ensureWorktree(
  workspaceId: string,
  repoPath: string,
  baseBranch?: string,
  branchPrefix?: string,
): Promise<EnsureWorktreeResult> {
  const worktreePath = getWorktreePath(workspaceId);

  if (fs.existsSync(worktreePath)) {
    return { worktreePath, created: false };
  }

  const base = getWorktreeBase();
  if (!fs.existsSync(base)) {
    fs.mkdirSync(base, { recursive: true });
  }

  const branchName = `${branchPrefix || "trace"}/${workspaceId.slice(0, 8)}`;
  const startPoint = baseBranch || "HEAD";

  const result = await new Promise<EnsureWorktreeResult>((resolve, reject) => {
    const proc = spawn(
      "git",
      ["worktree", "add", "-b", branchName, worktreePath, startPoint],
      {
        cwd: repoPath,
        stdio: "pipe",
      },
    );

    let stderr = "";
    proc.stderr?.on("data", (d) => (stderr += d.toString()));

    proc.on("close", (code) => {
      if (code !== 0) {
        const retry = spawn(
          "git",
          ["worktree", "add", worktreePath, branchName],
          {
            cwd: repoPath,
            stdio: "pipe",
          },
        );
        let retryErr = "";
        retry.stderr?.on("data", (d) => (retryErr += d.toString()));
        retry.on("close", (retryCode) => {
          if (retryCode !== 0) {
            reject(
              new Error(`Failed to create worktree: ${stderr} / ${retryErr}`),
            );
          } else {
            resolve({ worktreePath, created: true });
          }
        });
      } else {
        resolve({ worktreePath, created: true });
      }
    });
  });

  // Store the base branch SHA so merge detection can tell if base moved (for FF merges)
  if (result.created) {
    const baseSha = await runProcess(
      "git",
      ["rev-parse", startPoint],
      repoPath,
    );
    if (baseSha.code === 0) {
      await runProcess(
        "git",
        ["config", getBaseShaConfigKey(workspaceId), baseSha.stdout.trim()],
        repoPath,
      );
    }
  }

  return result;
}

/**
 * Parse `git worktree list --porcelain` to find the worktree path that has
 * `branchName` checked out, or `null` if the branch isn't checked out anywhere.
 */
async function findWorktreeForBranch(
  repoPath: string,
  branchName: string,
): Promise<string | null> {
  const result = await runProcess(
    "git",
    ["worktree", "list", "--porcelain"],
    repoPath,
  );
  if (result.code !== 0) return null;

  let currentWorktree: string | null = null;
  for (const line of result.stdout.split("\n")) {
    if (line.startsWith("worktree ")) {
      currentWorktree = line.slice("worktree ".length);
    } else if (line.startsWith("branch ") && currentWorktree) {
      const ref = line.slice("branch ".length); // e.g. refs/heads/my-branch
      if (ref === `refs/heads/${branchName}`) {
        return currentWorktree;
      }
    }
  }
  return null;
}

/**
 * If `branchName` is checked out in a worktree under our managed directory,
 * force-remove that worktree so the branch becomes free.
 * Returns true if the branch is now free, false if it's locked in an unmanaged location.
 */
async function freeBranchFromManagedWorktree(
  repoPath: string,
  branchName: string,
): Promise<{ freed: boolean; blockedBy?: string }> {
  const worktreePath = await findWorktreeForBranch(repoPath, branchName);
  if (!worktreePath) return { freed: true };

  const managedBase = getWorktreeBase();
  if (!worktreePath.startsWith(managedBase)) {
    return { freed: false, blockedBy: worktreePath };
  }

  // Force-remove the stale managed worktree
  await runProcess(
    "git",
    ["worktree", "remove", "--force", worktreePath],
    repoPath,
  );
  // If the directory still exists (e.g. git worktree remove failed), clean up manually
  if (fs.existsSync(worktreePath)) {
    fs.rmSync(worktreePath, { recursive: true, force: true });
  }
  await runProcess("git", ["worktree", "prune"], repoPath);
  return { freed: true };
}

export async function ensureWorktreeForBranch(
  workspaceId: string,
  repoPath: string,
  branchName: string,
  setupCommands?: string[],
): Promise<EnsureWorktreeResult> {
  const worktreePath = getWorktreePath(workspaceId);

  if (fs.existsSync(worktreePath)) {
    return { worktreePath, created: false };
  }

  const base = getWorktreeBase();
  if (!fs.existsSync(base)) {
    fs.mkdirSync(base, { recursive: true });
  }

  // Fetch the branch from remote
  await runProcess("git", ["fetch", "origin", branchName], repoPath);

  // Clean up stale worktree references (e.g. directory deleted without `git worktree remove`)
  await runProcess("git", ["worktree", "prune"], repoPath);

  // If the branch is checked out in a stale managed worktree, free it
  const { freed, blockedBy } = await freeBranchFromManagedWorktree(
    repoPath,
    branchName,
  );
  if (!freed) {
    throw new Error(
      `Branch ${branchName} is already checked out in ${blockedBy} (outside managed worktree directory)`,
    );
  }

  // Check if the branch already exists locally
  const revParse = await runProcess(
    "git",
    ["rev-parse", "--verify", `refs/heads/${branchName}`],
    repoPath,
  );
  let result;

  if (revParse.code === 0) {
    // Branch exists locally — reset it to match origin, then create worktree from it
    await runProcess(
      "git",
      ["branch", "-f", branchName, `origin/${branchName}`],
      repoPath,
    );
    result = await runProcess(
      "git",
      ["worktree", "add", worktreePath, branchName],
      repoPath,
    );
  } else {
    // Branch doesn't exist locally — create it tracking origin
    result = await runProcess(
      "git",
      [
        "worktree",
        "add",
        "-b",
        branchName,
        worktreePath,
        `origin/${branchName}`,
      ],
      repoPath,
    );
  }

  if (result.code !== 0) {
    throw new Error(
      `Failed to create worktree for branch ${branchName}: ${result.stderr}`,
    );
  }

  // Set upstream tracking
  await runProcess(
    "git",
    ["branch", "--set-upstream-to", `origin/${branchName}`],
    worktreePath,
  );

  // Run setup commands if provided
  if (setupCommands && setupCommands.length > 0) {
    const script = setupCommands.join("\n");
    if (script.trim()) {
      const setupResult = await runProcess(
        "sh",
        ["-c", `set -e\n${script}`],
        worktreePath,
      );
      if (setupResult.code !== 0) {
        console.error(
          `[setup-script] script failed (exit ${setupResult.code}):\n${setupResult.stderr}`,
        );
      }
    }
  }

  return { worktreePath, created: true };
}

export function stopAgentProcess(workspaceId: string): { stopped: boolean } {
  const existing = runningProcesses.get(workspaceId);
  if (!existing || existing.killed) {
    return { stopped: false };
  }

  const state = runStateByWorkspaceId.get(workspaceId);
  if (state) {
    state.userStopped = true;
  }
  stopWatchdog(workspaceId, "user-stop");
  existing.kill("SIGTERM");
  return { stopped: true };
}

export async function getWorktreeBranch(workspaceId: string): Promise<string> {
  const worktreePath = getWorktreePath(workspaceId);
  const result = await runProcess(
    "git",
    ["rev-parse", "--abbrev-ref", "HEAD"],
    worktreePath,
  );
  const branch = result.stdout.trim();
  if (result.code !== 0 || !branch) {
    return `trace/${workspaceId.slice(0, 8)}`;
  }
  return branch;
}

export async function commitWorktreeChanges(
  workspaceId: string,
): Promise<{ committed: boolean; error?: string }> {
  const worktreePath = getWorktreePath(workspaceId);

  if (!fs.existsSync(worktreePath)) {
    return { committed: false, error: "Worktree does not exist" };
  }

  try {
    // Stage everything (untracked, modified, deletions)
    await runProcess("git", ["add", "-A"], worktreePath);

    // Check if there's anything to commit
    const status = await runProcess(
      "git",
      ["status", "--porcelain"],
      worktreePath,
    );
    if (!status.stdout.trim()) {
      return { committed: false };
    }

    // Commit with --no-verify to skip pre-commit hooks (automated WIP commit)
    const commit = await runProcess(
      "git",
      [
        "commit",
        "--no-verify",
        "-m",
        "WIP: uncommitted changes before handoff",
      ],
      worktreePath,
    );
    if (commit.code !== 0) {
      return { committed: false, error: commit.stderr.trim() };
    }

    return { committed: true };
  } catch (err) {
    return { committed: false, error: String(err) };
  }
}

export async function pushWorktreeBranch(
  workspaceId: string,
  repoPath: string,
): Promise<{ success: boolean; error?: string }> {
  const worktreePath = getWorktreePath(workspaceId);
  if (!fs.existsSync(worktreePath)) {
    return { success: false, error: "Worktree does not exist" };
  }

  try {
    const branch = await getWorktreeBranch(workspaceId);
    const result = await runProcess(
      "git",
      ["push", "origin", branch],
      worktreePath,
    );
    if (result.code !== 0) {
      return { success: false, error: result.stderr.trim() };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function ensureWorktreeFromRemote(
  workspaceId: string,
  repoPath: string,
  branchName: string,
): Promise<{ success: boolean; worktreePath: string; error?: string }> {
  const worktreePath = getWorktreePath(workspaceId);

  if (fs.existsSync(worktreePath)) {
    // Worktree already exists — pull latest
    try {
      await runProcess("git", ["pull", "origin", branchName], worktreePath);
    } catch {
      // Best-effort pull
    }
    return { success: true, worktreePath };
  }

  const base = getWorktreeBase();
  if (!fs.existsSync(base)) {
    fs.mkdirSync(base, { recursive: true });
  }

  try {
    // Fetch the remote branch
    const fetchResult = await runProcess(
      "git",
      ["fetch", "origin", branchName],
      repoPath,
    );
    if (fetchResult.code !== 0) {
      return {
        success: false,
        worktreePath,
        error: `Failed to fetch branch: ${fetchResult.stderr.trim()}`,
      };
    }

    // Create worktree from the fetched remote branch
    const addResult = await runProcess(
      "git",
      [
        "worktree",
        "add",
        "-b",
        branchName,
        worktreePath,
        `origin/${branchName}`,
      ],
      repoPath,
    );
    if (addResult.code !== 0) {
      // Branch may already exist locally — try attaching to existing branch
      const retryResult = await runProcess(
        "git",
        ["worktree", "add", worktreePath, branchName],
        repoPath,
      );
      if (retryResult.code !== 0) {
        return {
          success: false,
          worktreePath,
          error: `Failed to create worktree: ${addResult.stderr.trim()} / ${retryResult.stderr.trim()}`,
        };
      }
      // Local branch may be stale — reset to match remote
      await runProcess(
        "git",
        ["reset", "--hard", `origin/${branchName}`],
        worktreePath,
      );
    }

    // Set up tracking
    await runProcess(
      "git",
      ["branch", "--set-upstream-to", `origin/${branchName}`, branchName],
      worktreePath,
    );

    return { success: true, worktreePath };
  } catch (err) {
    return { success: false, worktreePath, error: String(err) };
  }
}

export async function checkWorktreeExists(
  workspaceId: string,
  repoPath: string,
): Promise<{ exists: boolean; worktreePath: string }> {
  void repoPath;
  const worktreePath = getWorktreePath(workspaceId);
  const exists = fs.existsSync(worktreePath);
  return { exists, worktreePath };
}

export async function mergeWorktree(
  workspaceId: string,
  repoPath: string,
  baseBranch: string,
): Promise<{ success: boolean; branch: string }> {
  const worktreePath = getWorktreePath(workspaceId);

  if (!fs.existsSync(worktreePath)) {
    throw new Error(`Worktree not found: ${worktreePath}`);
  }

  const branch = await getWorktreeBranch(workspaceId);

  // Checkout the base branch and merge the worktree branch
  const checkoutResult = await runProcess(
    "git",
    ["checkout", baseBranch],
    repoPath,
  );
  if (checkoutResult.code !== 0) {
    throw new Error(
      `Failed to checkout ${baseBranch}: ${checkoutResult.stderr.trim()}`,
    );
  }

  const mergeResult = await runProcess("git", ["merge", branch], repoPath);
  if (mergeResult.code !== 0) {
    throw new Error(`Merge failed: ${mergeResult.stderr.trim()}`);
  }

  return { success: true, branch };
}

export async function deleteWorktree(
  workspaceId: string,
  repoPath: string,
  teardownCommands?: string[],
): Promise<{ removed: boolean; worktreePath: string }> {
  const worktreePath = getWorktreePath(workspaceId);
  const existing = runningProcesses.get(workspaceId);

  if (existing && !existing.killed) {
    suppressSyntheticStopFor.add(workspaceId);
    stopWatchdog(workspaceId, "delete-worktree");
    runStateByWorkspaceId.delete(workspaceId);
    existing.kill("SIGTERM");
    runningProcesses.delete(workspaceId);
    appendAgentDebugLog(
      workspaceId,
      "delete-worktree killed running process before deletion",
    );
  } else {
    stopWatchdog(workspaceId, "delete-worktree-no-process");
    runStateByWorkspaceId.delete(workspaceId);
  }

  if (!fs.existsSync(worktreePath)) {
    appendAgentDebugLog(
      workspaceId,
      `delete-worktree skipped (not found): ${worktreePath}`,
    );
    return { removed: false, worktreePath };
  }

  // Run teardown commands before removing the worktree
  if (teardownCommands && teardownCommands.length > 0) {
    const script = teardownCommands.join("\n");
    if (script.trim()) {
      appendAgentDebugLog(workspaceId, "delete-worktree running teardown script");
      const teardownResult = await runProcess(
        "sh",
        ["-c", `set -e\n${script}`],
        worktreePath,
      );
      if (teardownResult.code !== 0) {
        appendAgentDebugLog(
          workspaceId,
          `delete-worktree teardown script failed (exit ${teardownResult.code}): ${teardownResult.stderr.trim().slice(0, 500)}`,
        );
      } else {
        appendAgentDebugLog(workspaceId, "delete-worktree teardown script succeeded");
      }
    }
  }

  // Resolve the actual branch name before removing the worktree directory
  const branch = await getWorktreeBranch(workspaceId);

  const removeResult = await runProcess(
    "git",
    ["worktree", "remove", "--force", worktreePath],
    repoPath,
  );

  if (removeResult.code !== 0) {
    fs.rmSync(worktreePath, { recursive: true, force: true });
    appendAgentDebugLog(
      workspaceId,
      `delete-worktree git remove failed, fs fallback used stderr=${removeResult.stderr.trim().slice(0, 500)}`,
    );
  } else {
    appendAgentDebugLog(
      workspaceId,
      `delete-worktree git remove succeeded path=${worktreePath}`,
    );
  }

  await runProcess("git", ["worktree", "prune"], repoPath);
  await runProcess("git", ["branch", "-D", branch], repoPath);

  // Clean up stored base SHA from git config
  await runProcess(
    "git",
    ["config", "--unset", getBaseShaConfigKey(workspaceId)],
    repoPath,
  );
  // Backward compatibility cleanup for older keys.
  const legacyId = branch.replace("trace/", "");
  await runProcess(
    "git",
    ["config", "--unset", `trace.base-sha-${legacyId}`],
    repoPath,
  );

  return { removed: true, worktreePath };
}
