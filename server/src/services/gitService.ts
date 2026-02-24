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

export async function getGithubRemoteUrl(repoPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['remote', 'get-url', 'origin'], { cwd: repoPath });
    const url = stdout.trim();
    if (url.includes('github.com')) {
      return url;
    }
    return null;
  } catch {
    return null;
  }
}

export async function validateBranchExists(repoPath: string, branch: string): Promise<boolean> {
  try {
    await execFileAsync('git', ['rev-parse', '--verify', branch], { cwd: repoPath });
    return true;
  } catch {
    try {
      await execFileAsync('git', ['rev-parse', '--verify', `origin/${branch}`], { cwd: repoPath });
      return true;
    } catch {
      return false;
    }
  }
}
