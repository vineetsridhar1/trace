import type { BrowserWindow } from 'electron';
import * as pty from 'node-pty';

interface PtySession {
  process: pty.IPty;
  window: BrowserWindow;
}

const sessions = new Map<string, PtySession>();
const lastCwdByTerminalId = new Map<string, string>();
const lastEnvByTerminalId = new Map<string, Record<string, string>>();
// Track terminal IDs being replaced by createPty so we can suppress
// spurious pty-exit events from the old process.
const suppressExitIds = new Set<string>();

export function createPty(
  terminalId: string,
  cwd: string,
  window: BrowserWindow,
  extraEnv?: Record<string, string>,
): void {
  // Suppress exit event from the old PTY — it's being replaced, not stopped.
  if (sessions.has(terminalId)) {
    suppressExitIds.add(terminalId);
  }
  killPty(terminalId);
  lastCwdByTerminalId.set(terminalId, cwd);
  if (extraEnv) {
    lastEnvByTerminalId.set(terminalId, extraEnv);
  }

  const shell = process.platform === 'darwin' ? 'zsh' : process.env.SHELL || 'bash';
  const baseEnv = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => k !== 'CLAUDECODE'),
  ) as Record<string, string>;
  const proc = pty.spawn(shell, ['-l'], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd,
    env: { ...baseEnv, ...extraEnv },
  });

  proc.onData((data) => {
    if (!window.isDestroyed()) {
      window.webContents.send('pty-data', terminalId, data);
    }
  });

  proc.onExit(({ exitCode }) => {
    // Only clean up if this is still the active session for this terminalId.
    // A replaced PTY's onExit should not remove the new session.
    const current = sessions.get(terminalId);
    if (current?.process === proc) {
      sessions.delete(terminalId);
    }
    if (suppressExitIds.delete(terminalId)) {
      // This exit came from a replaced PTY — don't notify the renderer.
      return;
    }
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

export function getPtyEnv(terminalId: string): Record<string, string> | undefined {
  return lastEnvByTerminalId.get(terminalId);
}

export function hasPty(terminalId: string): boolean {
  return sessions.has(terminalId);
}

export function killAllPtys(): void {
  for (const [id] of sessions) {
    killPty(id);
  }
  lastCwdByTerminalId.clear();
  lastEnvByTerminalId.clear();
  suppressExitIds.clear();
}
