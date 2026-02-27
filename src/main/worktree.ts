import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { injectHooks } from './hooks';
import { runProcess } from './process';
import {
  runStateByMessageId,
  stopWatchdog,
  appendClaudeDebugLog,
} from './watchdog';

export const runningProcesses = new Map<string, import('node:child_process').ChildProcess>();
export const suppressSyntheticStopFor = new Set<string>();

let worktreeBase = '';

export function setWorktreeBase(dir: string) {
  worktreeBase = dir;
}

export function getWorktreeBase(): string {
  return worktreeBase;
}

export function getWorktreePath(messageId: string): string {
  return path.join(getWorktreeBase(), messageId);
}

export interface EnsureWorktreeResult {
  worktreePath: string;
  created: boolean;
}

export async function ensureWorktree(messageId: string, repoPath: string): Promise<EnsureWorktreeResult> {
  const worktreePath = getWorktreePath(messageId);

  if (fs.existsSync(worktreePath)) {
    injectHooks(worktreePath);
    return { worktreePath, created: false };
  }

  const base = getWorktreeBase();
  if (!fs.existsSync(base)) {
    fs.mkdirSync(base, { recursive: true });
  }

  const branchName = `trace/${messageId.slice(0, 8)}`;

  const result = await new Promise<EnsureWorktreeResult>((resolve, reject) => {
    const proc = spawn('git', ['worktree', 'add', '-b', branchName, worktreePath], {
      cwd: repoPath,
      stdio: 'pipe',
    });

    let stderr = '';
    proc.stderr?.on('data', (d) => (stderr += d.toString()));

    proc.on('close', (code) => {
      if (code !== 0) {
        const retry = spawn('git', ['worktree', 'add', worktreePath, branchName], {
          cwd: repoPath,
          stdio: 'pipe',
        });
        let retryErr = '';
        retry.stderr?.on('data', (d) => (retryErr += d.toString()));
        retry.on('close', (retryCode) => {
          if (retryCode !== 0) {
            reject(new Error(`Failed to create worktree: ${stderr} / ${retryErr}`));
          } else {
            injectHooks(worktreePath);
            resolve({ worktreePath, created: true });
          }
        });
      } else {
        injectHooks(worktreePath);
        resolve({ worktreePath, created: true });
      }
    });
  });

  // Store the base branch SHA so merge detection can tell if base moved (for FF merges)
  if (result.created) {
    const baseSha = await runProcess('git', ['rev-parse', 'HEAD'], repoPath);
    if (baseSha.code === 0) {
      const id = branchName.replace('trace/', '');
      await runProcess('git', ['config', `trace.base-sha-${id}`, baseSha.stdout.trim()], repoPath);
    }
  }

  return result;
}

export function stopClaudeProcess(messageId: string): { stopped: boolean } {
  const existing = runningProcesses.get(messageId);
  if (!existing || existing.killed) {
    return { stopped: false };
  }

  const state = runStateByMessageId.get(messageId);
  if (state) {
    state.userStopped = true;
  }
  stopWatchdog(messageId, 'user-stop');
  existing.kill('SIGTERM');
  return { stopped: true };
}

export async function getWorktreeBranch(messageId: string): Promise<string> {
  const worktreePath = getWorktreePath(messageId);
  const result = await runProcess('git', ['rev-parse', '--abbrev-ref', 'HEAD'], worktreePath);
  const branch = result.stdout.trim();
  if (result.code !== 0 || !branch) {
    return `trace/${messageId.slice(0, 8)}`;
  }
  return branch;
}

export async function checkWorktreeExists(messageId: string, _repoPath: string): Promise<{ exists: boolean; worktreePath: string }> {
  const worktreePath = getWorktreePath(messageId);
  const exists = fs.existsSync(worktreePath);
  return { exists, worktreePath };
}

export async function mergeWorktree(messageId: string, repoPath: string, baseBranch: string): Promise<{ success: boolean; branch: string }> {
  const worktreePath = getWorktreePath(messageId);

  if (!fs.existsSync(worktreePath)) {
    throw new Error(`Worktree not found: ${worktreePath}`);
  }

  const branch = await getWorktreeBranch(messageId);

  // Checkout the base branch and merge the worktree branch
  const checkoutResult = await runProcess('git', ['checkout', baseBranch], repoPath);
  if (checkoutResult.code !== 0) {
    throw new Error(`Failed to checkout ${baseBranch}: ${checkoutResult.stderr.trim()}`);
  }

  const mergeResult = await runProcess('git', ['merge', branch], repoPath);
  if (mergeResult.code !== 0) {
    throw new Error(`Merge failed: ${mergeResult.stderr.trim()}`);
  }

  return { success: true, branch };
}

export async function deleteWorktree(messageId: string, repoPath: string): Promise<{ removed: boolean; worktreePath: string }> {
  const worktreePath = getWorktreePath(messageId);
  const existing = runningProcesses.get(messageId);

  if (existing && !existing.killed) {
    suppressSyntheticStopFor.add(messageId);
    stopWatchdog(messageId, 'delete-worktree');
    runStateByMessageId.delete(messageId);
    existing.kill('SIGTERM');
    runningProcesses.delete(messageId);
    appendClaudeDebugLog(messageId, 'delete-worktree killed running process before deletion');
  } else {
    stopWatchdog(messageId, 'delete-worktree-no-process');
    runStateByMessageId.delete(messageId);
  }

  if (!fs.existsSync(worktreePath)) {
    appendClaudeDebugLog(messageId, `delete-worktree skipped (not found): ${worktreePath}`);
    return { removed: false, worktreePath };
  }

  // Resolve the actual branch name before removing the worktree directory
  const branch = await getWorktreeBranch(messageId);

  const removeResult = await runProcess('git', ['worktree', 'remove', '--force', worktreePath], repoPath);

  if (removeResult.code !== 0) {
    fs.rmSync(worktreePath, { recursive: true, force: true });
    appendClaudeDebugLog(
      messageId,
      `delete-worktree git remove failed, fs fallback used stderr=${removeResult.stderr.trim().slice(0, 500)}`,
    );
  } else {
    appendClaudeDebugLog(messageId, `delete-worktree git remove succeeded path=${worktreePath}`);
  }

  await runProcess('git', ['worktree', 'prune'], repoPath);
  await runProcess('git', ['branch', '-D', branch], repoPath);

  // Clean up stored base SHA from git config
  const id = branch.replace('trace/', '');
  await runProcess('git', ['config', '--unset', `trace.base-sha-${id}`], repoPath);

  return { removed: true, worktreePath };
}
