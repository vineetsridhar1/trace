import * as pty from "node-pty";
import os from "os";
import fs from "fs";

export interface TerminalCallbacks {
  onOutput: (terminalId: string, data: string) => void;
  onExit: (terminalId: string, exitCode: number) => void;
}

export interface TerminalManagerOptions {
  /** Default shell. Falls back to $SHELL, then platform-appropriate default. */
  defaultShell?: string;
}

export class TerminalManager {
  private terminals = new Map<string, pty.IPty>();
  /** Maps terminalId → sessionId for session-scoped cleanup */
  private terminalSessions = new Map<string, string>();
  private defaultShell: string;

  constructor(
    private callbacks: TerminalCallbacks,
    options?: TerminalManagerOptions,
  ) {
    this.defaultShell = options?.defaultShell
      ?? process.env.SHELL
      ?? (os.platform() === "win32" ? "powershell.exe" : "/bin/bash");
  }

  create(terminalId: string, sessionId: string, cwd: string, cols: number, rows: number): void {
    if (this.terminals.has(terminalId)) {
      this.destroy(terminalId);
    }

    // Fall back to home dir if the requested cwd doesn't exist
    const cwdExists = cwd && fs.existsSync(cwd);
    if (!cwdExists && cwd) {
      console.warn(`[terminal-manager] cwd "${cwd}" does not exist, falling back to home dir`);
    }
    const safeCwd = cwdExists ? cwd : os.homedir();

    // Spawn as a login shell so macOS runs path_helper (/etc/zprofile) and the
    // user's full environment is available.  Without -l, Electron's minimal
    // process.env can leave PATH incomplete, causing prompt themes that shell
    // out to git/node/etc. to hang or produce no output (blinking cursor).
    const args = os.platform() !== "win32" ? ["-l"] : [];

    const terminal = pty.spawn(this.defaultShell, args, {
      name: "xterm-256color",
      cols,
      rows,
      cwd: safeCwd,
      env: process.env as Record<string, string>,
    });

    terminal.onData((data) => {
      this.callbacks.onOutput(terminalId, data);
    });

    terminal.onExit(({ exitCode }) => {
      this.terminals.delete(terminalId);
      this.terminalSessions.delete(terminalId);
      this.callbacks.onExit(terminalId, exitCode);
    });

    this.terminals.set(terminalId, terminal);
    this.terminalSessions.set(terminalId, sessionId);
  }

  write(terminalId: string, data: string): void {
    const terminal = this.terminals.get(terminalId);
    if (terminal) {
      terminal.write(data);
    }
  }

  resize(terminalId: string, cols: number, rows: number): void {
    const terminal = this.terminals.get(terminalId);
    if (terminal) {
      terminal.resize(cols, rows);
    }
  }

  destroy(terminalId: string): void {
    const terminal = this.terminals.get(terminalId);
    if (terminal) {
      terminal.kill();
      this.terminals.delete(terminalId);
    }
    this.terminalSessions.delete(terminalId);
  }

  destroyAll(): void {
    for (const [id] of this.terminals) {
      this.destroy(id);
    }
  }

  /** Returns true if any terminals are active. */
  hasTerminals(): boolean {
    return this.terminals.size > 0;
  }

  /** Returns all active terminals as { terminalId, sessionId } pairs. */
  getActiveTerminals(): Array<{ terminalId: string; sessionId: string }> {
    const result: Array<{ terminalId: string; sessionId: string }> = [];
    for (const [terminalId, sessionId] of this.terminalSessions) {
      result.push({ terminalId, sessionId });
    }
    return result;
  }

  /** Destroy all terminals belonging to a session and return the destroyed terminal IDs. */
  destroyForSession(sessionId: string): string[] {
    const destroyed: string[] = [];
    for (const [terminalId, sid] of this.terminalSessions) {
      if (sid === sessionId) {
        destroyed.push(terminalId);
        this.destroy(terminalId);
      }
    }
    return destroyed;
  }
}
