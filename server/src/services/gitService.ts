import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';

const execFileAsync = promisify(execFile);

export async function validateGitRepo(repoPath: string): Promise<{ valid: boolean; error?: string }> {
  if (!fs.existsSync(repoPath)) {
    return { valid: false, error: 'Path does not exist' };
  }

  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: repoPath });
    if (stdout.trim() === 'true') {
      return { valid: true };
    }
    return { valid: false, error: 'Not a git repository' };
  } catch {
    return { valid: false, error: 'Not a git repository' };
  }
}

export async function getOriginRemoteUrl(repoPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['remote', 'get-url', 'origin'], { cwd: repoPath });
    const url = stdout.trim();
    return url || null;
  } catch {
    return null;
  }
}

export async function listBranches(repoPath: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['for-each-ref', '--format=%(refname:short)', 'refs/heads/'],
      { cwd: repoPath },
    );
    return stdout
      .split('\n')
      .map((b) => b.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

