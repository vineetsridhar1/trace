import { spawn, ChildProcess } from 'node:child_process';

export function runProcess(
  cmd: string,
  args: string[],
  cwd: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, stdio: 'pipe' });
    let stdout = '';
    let stderr = '';
    let done = false;

    const finish = (result: { code: number; stdout: string; stderr: string }) => {
      if (done) return;
      done = true;
      resolve(result);
    };

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });
    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });
    child.on('error', (err) => {
      stderr += String(err);
      finish({ code: 1, stdout, stderr });
    });
    child.on('close', (code) => {
      finish({ code: code ?? 1, stdout, stderr });
    });
  });
}
