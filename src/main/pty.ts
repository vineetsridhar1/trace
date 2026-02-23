import type { BrowserWindow } from 'electron';
import * as pty from 'node-pty';

interface PtySession {
  process: pty.IPty;
  window: BrowserWindow;
}

const sessions = new Map<string, PtySession>();
const lastCwdByTerminalId = new Map<string, string>();

export function createPty(
  terminalId: string,
  cwd: string,
  window: BrowserWindow,
): void {
  killPty(terminalId);
  lastCwdByTerminalId.set(terminalId, cwd);

  const shell = process.platform === 'darwin' ? 'zsh' : process.env.SHELL || 'bash';
  const proc = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd,
    env: Object.fromEntries(
      Object.entries(process.env).filter(([k]) => k !== 'CLAUDECODE'),
    ) as Record<string, string>,
  });

  proc.onData((data) => {
    if (!window.isDestroyed()) {
      window.webContents.send('pty-data', terminalId, data);
    }
  });

  proc.onExit(({ exitCode }) => {
    sessions.delete(terminalId);
    if (!window.isDestroyed()) {
      window.webContents.send('pty-exit', terminalId, exitCode);
    }
  });

  sessions.set(terminalId, { process: proc, window });
}

export function writePty(terminalId: string, data: string): boolean {
  const session = sessions.get(terminalId);
  if (!session) return false;
  session.process.write(data);
  return true;
}

export function resizePty(terminalId: string, cols: number, rows: number): boolean {
  const session = sessions.get(terminalId);
  if (!session) return false;
  session.process.resize(cols, rows);
  return true;
}

export function killPty(terminalId: string): boolean {
  const session = sessions.get(terminalId);
  if (!session) return false;
  session.process.kill();
  sessions.delete(terminalId);
  return true;
}

export function getPtyCwd(terminalId: string): string | undefined {
  return lastCwdByTerminalId.get(terminalId);
}

export function killAllPtys(): void {
  for (const [id] of sessions) {
    killPty(id);
  }
}
