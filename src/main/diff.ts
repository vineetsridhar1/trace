import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const MAX_DIFF_SIZE = 500_000;

interface WorktreeDiffResult {
  branchDiff: string;
  uncommittedDiff: string;
  stagedDiff: string;
  status: string;
}

async function runGit(args: string[], cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd, maxBuffer: 2 * 1024 * 1024 });
    return stdout;
  } catch (err) {
    const error = err as { stdout?: string; stderr?: string };
    return error.stdout ?? '';
  }
}

export async function getWorktreeDiff(worktreePath: string): Promise<WorktreeDiffResult> {
  const [branchDiff, uncommittedDiff, stagedDiff, status] = await Promise.all([
    runGit(['diff', 'main...HEAD'], worktreePath),
    runGit(['diff'], worktreePath),
    runGit(['diff', '--cached'], worktreePath),
    runGit(['status', '--porcelain'], worktreePath),
  ]);

  return {
    branchDiff: branchDiff.slice(0, MAX_DIFF_SIZE),
    uncommittedDiff: uncommittedDiff.slice(0, MAX_DIFF_SIZE),
    stagedDiff: stagedDiff.slice(0, MAX_DIFF_SIZE),
    status,
  };
}
