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

export async function getWorktreeDiff(worktreePath: string, baseBranch: string = 'main'): Promise<WorktreeDiffResult> {
  const [branchDiff, uncommittedDiff, stagedDiff, status] = await Promise.all([
    runGit(['diff', `${baseBranch}...HEAD`], worktreePath),
    runGit(['diff'], worktreePath),
    runGit(['diff', '--cached'], worktreePath),
    runGit(['status', '--porcelain'], worktreePath),
  ]);

  // Generate diffs for untracked files (git diff doesn't include them)
  const untrackedFiles = status
    .split('\n')
    .filter((line) => line.startsWith('??'))
    .map((line) => {
      const raw = line.slice(3);
      // git status --porcelain quotes filenames with spaces/special chars
      return raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw;
    })
    .slice(0, 50);

  let untrackedDiff = '';
  if (untrackedFiles.length > 0) {
    const diffs = await Promise.all(
      untrackedFiles.map((file) => runGit(['diff', '--no-index', '/dev/null', file], worktreePath)),
    );
    untrackedDiff = diffs.join('');
  }

  const fullUncommittedDiff = uncommittedDiff + untrackedDiff;

  return {
    branchDiff: branchDiff.slice(0, MAX_DIFF_SIZE),
    uncommittedDiff: fullUncommittedDiff.slice(0, MAX_DIFF_SIZE),
    stagedDiff: stagedDiff.slice(0, MAX_DIFF_SIZE),
    status,
  };
}
