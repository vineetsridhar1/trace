import * as pty from "node-pty";
import os from "os";

export interface TerminalCallbacks {
  onOutput: (terminalId: string, data: string) => void;
  onExit: (terminalId: string, exitCode: number) => void;
}

export class TerminalManager {
  private terminals = new Map<string, pty.IPty>();

  constructor(private callbacks: TerminalCallbacks) {}

  create(terminalId: string, cwd: string, cols: number, rows: number): void {
    if (this.terminals.has(terminalId)) {
      this.destroy(terminalId);
    }

    const shell = process.env.SHELL || (os.platform() === "win32" ? "powershell.exe" : "/bin/bash");
    const terminal = pty.spawn(shell, [], {
      name: "xterm-256color",
      cols,
      rows,
      cwd,
      env: process.env as Record<string, string>,
    });

    terminal.onData((data) => {
      this.callbacks.onOutput(terminalId, data);
    });

    terminal.onExit(({ exitCode }) => {
      this.terminals.delete(terminalId);
      this.callbacks.onExit(terminalId, exitCode);
    });

    this.terminals.set(terminalId, terminal);
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
  }

  destroyAll(): void {
    for (const [id] of this.terminals) {
      this.destroy(id);
    }
  }

  /** Destroy all terminals associated with a session. */
  destroyForSession(sessionId: string, terminalSessionMap: Map<string, string>): void {
    for (const [terminalId, sid] of terminalSessionMap) {
      if (sid === sessionId && this.terminals.has(terminalId)) {
        this.destroy(terminalId);
      }
    }
  }
}
