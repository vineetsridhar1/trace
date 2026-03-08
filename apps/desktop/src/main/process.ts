import { spawn, type ChildProcess } from 'node:child_process';

/**
 * Kill a process and its entire subprocess tree.
 * Agents are spawned with `detached: true` so they get their own process group.
 * Sending a signal to the negative PID kills the whole group, ensuring
 * subagents and tool processes don't become orphans.
 */
export function killProcessGroup(
  child: ChildProcess,
  signal: NodeJS.Signals = "SIGTERM",
): void {
  if (child.killed) return;
  if (child.pid) {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {
      // Process group kill failed (e.g. process already exited) — fall through
    }
  }
  try {
    child.kill(signal);
  } catch {
    // Already dead
  }
}

export function runProcess(
  cmd: string,
  args: string[],
  cwd: string,
  stdin?: string,
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

    if (stdin !== undefined) {
      child.stdin?.write(stdin);
      child.stdin?.end();
    }
  });
}
