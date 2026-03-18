import { randomUUID } from "crypto";
import type WebSocket from "ws";
import { sessionRouter } from "./session-router.js";

interface TerminalEntry {
  sessionId: string;
  frontendWs: WebSocket | null;
  ready: boolean;
  /** True once the bridge has sent terminal_exit or terminal_error */
  terminated: boolean;
  /** Messages buffered before the frontend attaches */
  buffer: string[];
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

    this.terminals.set(terminalId, { sessionId, frontendWs: null, ready: false, terminated: false, buffer: [] });
    const ids = this.sessionTerminals.get(sessionId) ?? new Set();
    ids.add(terminalId);
    this.sessionTerminals.set(sessionId, ids);

    // Send terminal_create command to the bridge
    const result = sessionRouter.send(sessionId, {
      type: "terminal_create",
      terminalId,
      sessionId,
      cols,
      rows,
      cwd: cwd ?? "",
    });

    if (result !== "delivered") {
      // Bridge not available — buffer an error so the frontend gets feedback on attach
      const errorMsg = JSON.stringify({ type: "error", message: `Terminal creation failed: ${result}` });
      const entry = this.terminals.get(terminalId);
      if (entry) entry.buffer.push(errorMsg);
    }

    return terminalId;
  }

  /** Attach a frontend WebSocket to an existing terminal. Flushes any buffered messages. */
  attachFrontend(terminalId: string, ws: WebSocket): boolean {
    const entry = this.terminals.get(terminalId);
    if (!entry) return false;
    entry.frontendWs = ws;

    // Flush buffered messages (e.g. terminal_ready that arrived before attach)
    for (const msg of entry.buffer) {
      ws.send(msg);
    }
    entry.buffer.length = 0;

    // If the terminal already exited/errored while buffered, clean up now
    if (entry.terminated) {
      this.removeTerminal(terminalId);
    }

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
    if (!entry) return;

    let serialized: string | null = null;
    if (msg.type === "terminal_output") {
      serialized = JSON.stringify({ type: "output", data: msg.data });
    } else if (msg.type === "terminal_exit") {
      serialized = JSON.stringify({ type: "exit", exitCode: msg.exitCode });
    } else if (msg.type === "terminal_ready") {
      entry.ready = true;
      serialized = JSON.stringify({ type: "ready" });
    } else if (msg.type === "terminal_error") {
      serialized = JSON.stringify({ type: "error", message: msg.error });
    }

    if (!serialized) return;

    const isTerminalEnd = msg.type === "terminal_exit" || msg.type === "terminal_error";
    if (isTerminalEnd) entry.terminated = true;

    if (entry.frontendWs && entry.frontendWs.readyState === entry.frontendWs.OPEN) {
      entry.frontendWs.send(serialized);
      if (isTerminalEnd) this.removeTerminal(msg.terminalId);
    } else {
      // Buffer until frontend attaches (e.g. terminal_ready arrives before WS connect)
      entry.buffer.push(serialized);
      // Schedule cleanup so the entry doesn't leak if frontend never attaches
      if (isTerminalEnd) {
        setTimeout(() => this.removeTerminal(msg.terminalId), 30_000);
      }
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
