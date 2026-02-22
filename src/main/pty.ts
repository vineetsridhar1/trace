import type { BrowserWindow } from 'electron';
import * as pty from 'node-pty';

interface PtySession {
  process: pty.IPty;
  window: BrowserWindow;
}

const sessions = new Map<string, PtySession>();

export function createPty(
  terminalId: string,
  cwd: string,
  window: BrowserWindow,
): void {
  killPty(terminalId);

  const shell = process.platform === 'darwin' ? 'zsh' : process.env.SHELL || 'bash';
  const proc = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd,
    env: process.env as Record<string, string>,
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

export function writePty(terminalId: string, data: string): void {
  sessions.get(terminalId)?.process.write(data);
}

export function resizePty(terminalId: string, cols: number, rows: number): void {
  sessions.get(terminalId)?.process.resize(cols, rows);
}

export function killPty(terminalId: string): void {
  const session = sessions.get(terminalId);
  if (!session) return;
  session.process.kill();
  sessions.delete(terminalId);
}

export function killAllPtys(): void {
  for (const [id] of sessions) {
    killPty(id);
  }
}
