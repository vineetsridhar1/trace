import { randomUUID } from "crypto";
import type WebSocket from "ws";
import { sessionRouter } from "./session-router.js";

interface TerminalEntry {
  sessionId: string;
  frontendWs: WebSocket | null;
}

/**
 * Relays terminal I/O between frontend WebSocket clients and bridge runtimes.
 * No persistence — terminal data is ephemeral and never hits the event store.
 */
class TerminalRelay {
  private terminals = new Map<string, TerminalEntry>();
  /** Reverse index: sessionId → Set<terminalId> for bulk cleanup */
  private sessionTerminals = new Map<string, Set<string>>();

  /**
   * Create a terminal on the bridge for a given session.
   * Returns the terminalId that the frontend uses to attach.
   */
  createTerminal(sessionId: string, cols: number, rows: number, cwd?: string): string {
    const terminalId = randomUUID();

    this.terminals.set(terminalId, { sessionId, frontendWs: null });
    const ids = this.sessionTerminals.get(sessionId) ?? new Set();
    ids.add(terminalId);
    this.sessionTerminals.set(sessionId, ids);

    // Send terminal_create command to the bridge
    sessionRouter.send(sessionId, {
      type: "terminal_create",
      terminalId,
      sessionId,
      cols,
      rows,
      cwd: cwd ?? "",
    });

    return terminalId;
  }

  /** Attach a frontend WebSocket to an existing terminal. */
  attachFrontend(terminalId: string, ws: WebSocket): boolean {
    const entry = this.terminals.get(terminalId);
    if (!entry) return false;
    entry.frontendWs = ws;
    return true;
  }

  /** Detach the frontend WebSocket (e.g. on disconnect). */
  detachFrontend(terminalId: string): void {
    const entry = this.terminals.get(terminalId);
    if (entry) {
      entry.frontendWs = null;
    }
  }

  /** Get the sessionId for a terminal (used for auth checks). */
  getSessionId(terminalId: string): string | undefined {
    return this.terminals.get(terminalId)?.sessionId;
  }

  /** Forward a message from the bridge to the attached frontend WebSocket. */
  relayFromBridge(msg: { type: string; terminalId: string; [key: string]: unknown }): void {
    const entry = this.terminals.get(msg.terminalId);
    if (!entry?.frontendWs || entry.frontendWs.readyState !== entry.frontendWs.OPEN) return;

    if (msg.type === "terminal_output") {
      entry.frontendWs.send(JSON.stringify({ type: "output", data: msg.data }));
    } else if (msg.type === "terminal_exit") {
      entry.frontendWs.send(JSON.stringify({ type: "exit", exitCode: msg.exitCode }));
      this.removeTerminal(msg.terminalId);
    } else if (msg.type === "terminal_ready") {
      entry.frontendWs.send(JSON.stringify({ type: "ready" }));
    } else if (msg.type === "terminal_error") {
      entry.frontendWs.send(JSON.stringify({ type: "error", message: msg.error }));
      this.removeTerminal(msg.terminalId);
    }
  }

  /** Forward input/resize from the frontend to the bridge. */
  relayFromFrontend(terminalId: string, type: "input" | "resize", payload: Record<string, unknown>): void {
    const entry = this.terminals.get(terminalId);
    if (!entry) return;

    if (type === "input") {
      sessionRouter.send(entry.sessionId, {
        type: "terminal_input",
        terminalId,
        data: payload.data as string,
      });
    } else if (type === "resize") {
      sessionRouter.send(entry.sessionId, {
        type: "terminal_resize",
        terminalId,
        cols: payload.cols as number,
        rows: payload.rows as number,
      });
    }
  }

  /** Destroy a terminal — sends command to bridge and cleans up. */
  destroyTerminal(terminalId: string): void {
    const entry = this.terminals.get(terminalId);
    if (!entry) return;

    sessionRouter.send(entry.sessionId, {
      type: "terminal_destroy",
      terminalId,
    });

    this.removeTerminal(terminalId);
  }

  /** Destroy all terminals for a session (called on session destroy/disconnect). */
  destroyAllForSession(sessionId: string): void {
    const ids = this.sessionTerminals.get(sessionId);
    if (!ids) return;
    for (const terminalId of ids) {
      const entry = this.terminals.get(terminalId);
      if (entry?.frontendWs && entry.frontendWs.readyState === entry.frontendWs.OPEN) {
        entry.frontendWs.send(JSON.stringify({ type: "exit", exitCode: -1 }));
      }
      this.terminals.delete(terminalId);
    }
    this.sessionTerminals.delete(sessionId);
  }

  /** Detach all frontend WebSockets associated with a given WebSocket (called on /terminal WS close). */
  detachAllForFrontend(ws: WebSocket): void {
    for (const [terminalId, entry] of this.terminals) {
      if (entry.frontendWs === ws) {
        entry.frontendWs = null;
      }
    }
  }

  private removeTerminal(terminalId: string): void {
    const entry = this.terminals.get(terminalId);
    if (entry) {
      const ids = this.sessionTerminals.get(entry.sessionId);
      if (ids) {
        ids.delete(terminalId);
        if (ids.size === 0) this.sessionTerminals.delete(entry.sessionId);
      }
    }
    this.terminals.delete(terminalId);
  }
}

export const terminalRelay = new TerminalRelay();
