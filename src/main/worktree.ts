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

let targetDir = process.cwd();
let worktreeBase = '';

export function setTargetDir(dir: string) {
  targetDir = dir;
}

export function getTargetDir(): string {
  return targetDir;
}

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

export function ensureWorktree(messageId: string): Promise<EnsureWorktreeResult> {
  const worktreePath = getWorktreePath(messageId);

  if (fs.existsSync(worktreePath)) {
    injectHooks(worktreePath);
    return Promise.resolve({ worktreePath, created: false });
  }

  const base = getWorktreeBase();
  if (!fs.existsSync(base)) {
    fs.mkdirSync(base, { recursive: true });
  }

  const branchName = `trace/${messageId.slice(0, 8)}`;

  return new Promise<EnsureWorktreeResult>((resolve, reject) => {
    const result = spawn('git', ['worktree', 'add', '-b', branchName, worktreePath], {
      cwd: targetDir,
      stdio: 'pipe',
    });

    let stderr = '';
    result.stderr?.on('data', (d) => (stderr += d.toString()));

    result.on('close', (code) => {
      if (code !== 0) {
        const retry = spawn('git', ['worktree', 'add', worktreePath, branchName], {
          cwd: targetDir,
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
}

export function stopClaudeProcess(messageId: string): { stopped: boolean } {
  const existing = runningProcesses.get(messageId);
  if (!existing || existing.killed) {
    return { stopped: false };
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

export function checkWorktreeExists(messageId: string): { exists: boolean; worktreePath: string } {
  const worktreePath = getWorktreePath(messageId);
  return { exists: fs.existsSync(worktreePath), worktreePath };
}

export async function mergeWorktree(messageId: string): Promise<{ success: boolean; branch: string }> {
  const worktreePath = getWorktreePath(messageId);

  if (!fs.existsSync(worktreePath)) {
    throw new Error(`Worktree not found: ${worktreePath}`);
  }

  const branch = await getWorktreeBranch(messageId);

  // Merge the branch into main from the target (main) directory
  const mergeResult = await runProcess('git', ['merge', branch], targetDir);
  if (mergeResult.code !== 0) {
    throw new Error(`Merge failed: ${mergeResult.stderr.trim()}`);
  }

  return { success: true, branch };
}

export async function deleteWorktree(messageId: string): Promise<{ removed: boolean; worktreePath: string }> {
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

  const removeResult = await runProcess('git', ['worktree', 'remove', '--force', worktreePath], targetDir);

  if (removeResult.code !== 0) {
    fs.rmSync(worktreePath, { recursive: true, force: true });
    appendClaudeDebugLog(
      messageId,
      `delete-worktree git remove failed, fs fallback used stderr=${removeResult.stderr.trim().slice(0, 500)}`,
    );
  } else {
    appendClaudeDebugLog(messageId, `delete-worktree git remove succeeded path=${worktreePath}`);
  }

  await runProcess('git', ['worktree', 'prune'], targetDir);
  await runProcess('git', ['branch', '-D', branch], targetDir);

  return { removed: true, worktreePath };
}
