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

const WORKTREE_BASE_NAME = '.trace-worktrees';

export const runningProcesses = new Map<string, import('node:child_process').ChildProcess>();
export const suppressSyntheticStopFor = new Set<string>();

let targetDir = process.cwd();

export function setTargetDir(dir: string) {
  targetDir = dir;
}

export function getTargetDir(): string {
  return targetDir;
}

export function getWorktreeBase(): string {
  return path.join(targetDir, WORKTREE_BASE_NAME);
}

export function getWorktreePath(messageId: string): string {
  return path.join(getWorktreeBase(), messageId);
}

export function ensureWorktree(messageId: string): Promise<string> {
  const worktreePath = getWorktreePath(messageId);

  if (fs.existsSync(worktreePath)) {
    injectHooks(worktreePath);
    return Promise.resolve(worktreePath);
  }

  const base = getWorktreeBase();
  if (!fs.existsSync(base)) {
    fs.mkdirSync(base, { recursive: true });
  }

  const branchName = `trace/${messageId.slice(0, 8)}`;

  return new Promise<string>((resolve, reject) => {
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
            resolve(worktreePath);
          }
        });
      } else {
        injectHooks(worktreePath);
        resolve(worktreePath);
      }
    });
  });
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
  await runProcess('git', ['branch', '-D', `trace/${messageId.slice(0, 8)}`], targetDir);

  return { removed: true, worktreePath };
}
