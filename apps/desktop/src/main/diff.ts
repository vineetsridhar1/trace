import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs';
import * as path from 'node:path';

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

const MAX_UNTRACKED_FILES = 50;
const MAX_UNTRACKED_FILE_SIZE = 50_000;

async function buildUntrackedDiffs(worktreePath: string): Promise<string> {
  const output = await runGit(['ls-files', '--others', '--exclude-standard'], worktreePath);
  if (!output.trim()) return '';

  const filePaths = output.trim().split('\n').slice(0, MAX_UNTRACKED_FILES);
  const diffs: string[] = [];

  for (const filePath of filePaths) {
    const fullPath = path.join(worktreePath, filePath);
    let content: Buffer;
    try {
      content = await fs.promises.readFile(fullPath);
    } catch {
      continue;
    }

    const header = `diff --git a/${filePath} b/${filePath}\nnew file mode 100644\n--- /dev/null\n+++ b/${filePath}`;

    // Binary detection: check for null bytes in first 8KB
    const sample = content.subarray(0, 8192);
    if (sample.includes(0)) {
      diffs.push(`${header}\nBinary files /dev/null and b/${filePath} differ`);
      continue;
    }

    const text = content.toString('utf-8');

    if (text.length === 0) {
      diffs.push(`${header}\n@@ -0,0 +0,0 @@`);
      continue;
    }

    const truncated = text.length > MAX_UNTRACKED_FILE_SIZE;
    const usableText = truncated ? text.slice(0, MAX_UNTRACKED_FILE_SIZE) : text;
    const lines = usableText.split('\n');
    // If the text was truncated mid-line or the original was truncated, note it
    if (truncated && lines.length > 0) {
      lines.push('\\ No newline at end of file (truncated)');
    }
    const lineCount = lines.length;
    const body = lines.map((l) => `+${l}`).join('\n');

    diffs.push(`${header}\n@@ -0,0 +1,${lineCount} @@\n${body}`);
  }

  return diffs.join('\n');
}

export async function getWorktreeDiff(worktreePath: string, baseBranch: string = 'main'): Promise<WorktreeDiffResult> {
  const [branchDiff, uncommittedDiff, stagedDiff, status, untrackedDiffs] = await Promise.all([
    runGit(['diff', baseBranch], worktreePath),
    runGit(['diff'], worktreePath),
    runGit(['diff', '--cached'], worktreePath),
    runGit(['status', '--porcelain'], worktreePath),
    buildUntrackedDiffs(worktreePath),
  ]);

  const appendUntracked = (diff: string) =>
    untrackedDiffs ? (diff ? `${diff}\n${untrackedDiffs}` : untrackedDiffs) : diff;

  return {
    branchDiff: appendUntracked(branchDiff).slice(0, MAX_DIFF_SIZE),
    uncommittedDiff: appendUntracked(uncommittedDiff).slice(0, MAX_DIFF_SIZE),
    stagedDiff: stagedDiff.slice(0, MAX_DIFF_SIZE),
    status,
  };
}
