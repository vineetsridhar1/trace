import { randomUUID } from "crypto";
import type WebSocket from "ws";
import { prisma } from "./db.js";
import { sessionRouter } from "./session-router.js";

interface TerminalEntry {
  sessionId: string;
  sessionGroupId: string | null;
  frontendWs: WebSocket | null;
  /** User who currently has a frontend WebSocket attached to this terminal. */
  attachedUserId: string | null;
  ready: boolean;
  /** True once the bridge has sent terminal_exit or terminal_error */
  terminated: boolean;
  /** Messages buffered before the frontend attaches */
  buffer: string[];
  /** Ring buffer of raw output chunks for scrollback replay on reconnect */
  scrollback: string[];
  /** Running byte total of scrollback chunks */
  scrollbackBytes: number;
  /** Timer to kill orphaned terminals that no frontend attaches to */
  orphanTimer: ReturnType<typeof setTimeout> | null;
  /** Optional server-side callbacks for terminal lifecycle events */
  onReady?: () => void;
  onEnd?: (exitCode: number | null, error?: string) => void;
}

/**
 * Relays terminal I/O between frontend WebSocket clients and bridge runtimes.
 * No persistence — terminal data is ephemeral and never hits the event store.
 */
class TerminalRelay {
  /** If no frontend attaches within this window, kill the orphaned terminal. */
  private static ORPHAN_TIMEOUT_MS = 30 * 60 * 1000;
  /** Max scrollback buffer size in bytes — older output is trimmed from the front. */
  private static MAX_SCROLLBACK_BYTES = 50 * 1024;

  private terminals = new Map<string, TerminalEntry>();
  /** Reverse index: sessionId → Set<terminalId> for bulk cleanup */
  private sessionTerminals = new Map<string, Set<string>>();
  /** Reverse index: sessionGroupId → Set<terminalId> for group-scoped terminal tabs */
  private sessionGroupTerminals = new Map<string, Set<string>>();

  /**
   * Create a terminal on the bridge for a given session.
   * Returns the terminalId that the frontend uses to attach.
   */
  createTerminal(
    sessionId: string,
    sessionGroupId: string | null,
    cols: number,
    rows: number,
    cwd?: string,
  ): string {
    const terminalId = randomUUID();

    this.terminals.set(terminalId, {
      sessionId,
      sessionGroupId,
      frontendWs: null,
      attachedUserId: null,
      ready: false,
      terminated: false,
      buffer: [],
      scrollback: [],
      scrollbackBytes: 0,
      orphanTimer: null,
    });
    const ids = this.sessionTerminals.get(sessionId) ?? new Set();
    ids.add(terminalId);
    this.sessionTerminals.set(sessionId, ids);
    if (sessionGroupId) {
      const groupIds = this.sessionGroupTerminals.get(sessionGroupId) ?? new Set();
      groupIds.add(terminalId);
      this.sessionGroupTerminals.set(sessionGroupId, groupIds);
    }

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

  /**
   * Execute a command in a headless terminal. Returns a promise that resolves
   * with the exit code (0 = success) or rejects on error. The terminal is
   * cleaned up automatically on completion.
   */
  executeCommand(
    sessionId: string,
    sessionGroupId: string | null,
    command: string,
    cwd?: string,
    timeoutMs = 300_000,
  ): Promise<number> {
    return new Promise((resolve, reject) => {
      const terminalId = this.createTerminal(sessionId, sessionGroupId, 80, 24, cwd);
      const entry = this.terminals.get(terminalId);
      if (!entry) {
        reject(new Error("Failed to create terminal"));
        return;
      }

      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.destroyTerminal(terminalId);
        reject(new Error(`Setup script timed out after ${timeoutMs / 1000}s`));
      }, timeoutMs);

      entry.onReady = () => {
        sessionRouter.send(sessionId, {
          type: "terminal_input",
          terminalId,
          data: command + "\n",
        });
      };

      entry.onEnd = (exitCode: number | null, error?: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) {
          reject(new Error(error));
        } else {
          resolve(exitCode ?? 1);
        }
      };
    });
  }

  /**
   * Rebuild relay entries from bridge-reported active terminals (on reconnect).
   * Skips entries that already exist. Starts orphan cleanup timer for each restored entry.
   */
  async restoreTerminals(terminals: Array<{ terminalId: string; sessionId: string }>): Promise<void> {
    const sessionIds = [...new Set(terminals.map(({ sessionId }) => sessionId))];
    const sessions = sessionIds.length === 0
      ? []
      : await prisma.session.findMany({
          where: { id: { in: sessionIds } },
          select: { id: true, sessionGroupId: true },
        });
    const sessionGroupIds = new Map<string, string | null>(
      sessions.map((session: { id: string; sessionGroupId: string | null }) => [session.id, session.sessionGroupId ?? null]),
    );

    for (const { terminalId, sessionId } of terminals) {
      if (this.terminals.has(terminalId)) continue;
      const sessionGroupId = sessionGroupIds.get(sessionId) ?? null;

      this.terminals.set(terminalId, {
        sessionId,
        sessionGroupId,
        frontendWs: null,
        attachedUserId: null,
        ready: true, // Bridge says it's alive, so it's ready
        terminated: false,
        buffer: [],
        scrollback: [],
        scrollbackBytes: 0,
        orphanTimer: null,
      });

      const ids = this.sessionTerminals.get(sessionId) ?? new Set();
      ids.add(terminalId);
      this.sessionTerminals.set(sessionId, ids);
      if (sessionGroupId) {
        const groupIds = this.sessionGroupTerminals.get(sessionGroupId) ?? new Set();
        groupIds.add(terminalId);
        this.sessionGroupTerminals.set(sessionGroupId, groupIds);
      }

      this.scheduleOrphanCleanup(terminalId);
    }
  }

  /** Returns non-terminated terminal IDs for a session. */
  getTerminalsForSession(sessionId: string): string[] {
    const ids = this.sessionTerminals.get(sessionId);
    if (!ids) return [];
    const result: string[] = [];
    for (const id of ids) {
      const entry = this.terminals.get(id);
      if (entry && !entry.terminated) result.push(id);
    }
    return result;
  }

  /** Returns non-terminated terminal IDs for a session group. */
  getTerminalsForSessionGroup(sessionGroupId: string): string[] {
    const ids = this.sessionGroupTerminals.get(sessionGroupId);
    if (!ids) return [];
    const result: string[] = [];
    for (const id of ids) {
      const entry = this.terminals.get(id);
      if (entry && !entry.terminated) result.push(id);
    }
    return result;
  }

  /** Attach a frontend WebSocket to an existing terminal. Flushes any buffered messages. */
  attachFrontend(terminalId: string, ws: WebSocket, userId: string): boolean {
    const entry = this.terminals.get(terminalId);
    if (!entry) return false;
    entry.frontendWs = ws;
    entry.attachedUserId = userId;
    const hadBufferedReady = entry.buffer.some((msg) => msg.includes("\"type\":\"ready\""));

    // Cancel orphan cleanup — a frontend has attached
    this.cancelOrphanCleanup(terminalId);

    // Replay scrollback history so the frontend sees prior output
    if (entry.scrollback.length > 0) {
      ws.send(JSON.stringify({ type: "output", data: entry.scrollback.join("") }));
    }

    // Flush buffered messages (e.g. terminal_ready that arrived before attach)
    for (const msg of entry.buffer) {
      ws.send(msg);
    }
    entry.buffer.length = 0;
    if (entry.ready && !hadBufferedReady) {
      ws.send(JSON.stringify({ type: "ready" }));
    }

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
      entry.attachedUserId = null;
      this.scheduleOrphanCleanup(terminalId);
    }
  }

  /** Get the sessionId for a terminal (used for auth checks). */
  getSessionId(terminalId: string): string | undefined {
    return this.terminals.get(terminalId)?.sessionId;
  }

  getSessionGroupId(terminalId: string): string | undefined {
    return this.terminals.get(terminalId)?.sessionGroupId ?? undefined;
  }

  /** Forward a message from the bridge to the attached frontend WebSocket. */
  relayFromBridge(msg: { type: string; terminalId: string; [key: string]: unknown }): void {
    const entry = this.terminals.get(msg.terminalId);
    if (!entry) return;

    // Accumulate output into the scrollback ring buffer
    if (msg.type === "terminal_output") {
      const data = msg.data as string;
      entry.scrollback.push(data);
      entry.scrollbackBytes += data.length;
      // Trim oldest chunks when over budget
      while (entry.scrollbackBytes > TerminalRelay.MAX_SCROLLBACK_BYTES && entry.scrollback.length > 1) {
        entry.scrollbackBytes -= entry.scrollback.shift()!.length;
      }
    }

    let serialized: string | null = null;
    if (msg.type === "terminal_output") {
      serialized = JSON.stringify({ type: "output", data: msg.data });
    } else if (msg.type === "terminal_exit") {
      serialized = JSON.stringify({ type: "exit", exitCode: msg.exitCode });
    } else if (msg.type === "terminal_ready") {
      entry.ready = true;
      serialized = JSON.stringify({ type: "ready" });
      entry.onReady?.();
    } else if (msg.type === "terminal_error") {
      serialized = JSON.stringify({ type: "error", message: msg.error });
    }

    if (!serialized) return;

    const isTerminalEnd = msg.type === "terminal_exit" || msg.type === "terminal_error";
    if (isTerminalEnd) {
      entry.terminated = true;
      if (msg.type === "terminal_exit") {
        entry.onEnd?.(msg.exitCode as number | null);
      } else {
        entry.onEnd?.(null, msg.error as string | undefined);
      }
    }

    if (entry.frontendWs && entry.frontendWs.readyState === entry.frontendWs.OPEN) {
      entry.frontendWs.send(serialized);
      if (isTerminalEnd) this.removeTerminal(msg.terminalId);
    } else {
      // Buffer non-output messages until frontend attaches (e.g. terminal_ready).
      // Output is not buffered here — scrollback handles output replay on attach.
      if (msg.type !== "terminal_output") {
        entry.buffer.push(serialized);
      }
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
      if (!entry) continue;
      // Kill the terminal process on the bridge
      sessionRouter.send(entry.sessionId, { type: "terminal_destroy", terminalId });
      if (entry.frontendWs && entry.frontendWs.readyState === entry.frontendWs.OPEN) {
        entry.frontendWs.send(JSON.stringify({ type: "exit", exitCode: -1 }));
      }
      this.cancelOrphanCleanup(terminalId);
      if (entry.sessionGroupId) {
        const groupIds = this.sessionGroupTerminals.get(entry.sessionGroupId);
        if (groupIds) {
          groupIds.delete(terminalId);
          if (groupIds.size === 0) this.sessionGroupTerminals.delete(entry.sessionGroupId);
        }
      }
      this.terminals.delete(terminalId);
    }
    this.sessionTerminals.delete(sessionId);
  }

  destroyAllForSessionGroup(sessionGroupId: string): void {
    const ids = this.sessionGroupTerminals.get(sessionGroupId);
    if (!ids) return;
    for (const terminalId of ids) {
      const entry = this.terminals.get(terminalId);
      if (!entry) continue;
      // Kill the terminal process on the bridge
      sessionRouter.send(entry.sessionId, { type: "terminal_destroy", terminalId });
      if (entry.frontendWs && entry.frontendWs.readyState === entry.frontendWs.OPEN) {
        entry.frontendWs.send(JSON.stringify({ type: "exit", exitCode: -1 }));
      }
      this.cancelOrphanCleanup(terminalId);
      this.terminals.delete(terminalId);
      const sessionIds = this.sessionTerminals.get(entry.sessionId);
      if (sessionIds) {
        sessionIds.delete(terminalId);
        if (sessionIds.size === 0) this.sessionTerminals.delete(entry.sessionId);
      }
    }
    this.sessionGroupTerminals.delete(sessionGroupId);
  }

  /** Detach all frontend WebSockets associated with a given WebSocket (called on /terminal WS close). */
  detachAllForFrontend(ws: WebSocket): void {
    for (const [terminalId, entry] of this.terminals) {
      if (entry.frontendWs === ws) {
        entry.frontendWs = null;
        entry.attachedUserId = null;
        this.scheduleOrphanCleanup(terminalId);
      }
    }
  }

  /**
   * Destroy terminals attached by a specific user whose session falls within
   * the given scope. Called when a bridge access grant is revoked — closes
   * the grantee's frontend WS immediately and tears down the PTY on the
   * bridge side. `sessionIds` limits the scope (for a session_group grant the
   * caller passes the set of sessions in that group; for all_sessions it
   * passes undefined to match all sessions).
   */
  destroyTerminalsForUser(userId: string, sessionIds?: Set<string>): void {
    for (const [terminalId, entry] of this.terminals) {
      if (entry.attachedUserId !== userId) continue;
      if (sessionIds && !sessionIds.has(entry.sessionId)) continue;
      if (entry.frontendWs && entry.frontendWs.readyState === entry.frontendWs.OPEN) {
        entry.frontendWs.send(
          JSON.stringify({ type: "error", message: "Bridge access revoked" }),
        );
        entry.frontendWs.close(1008, "Bridge access revoked");
      }
      this.destroyTerminal(terminalId);
    }
  }

  private scheduleOrphanCleanup(terminalId: string): void {
    const entry = this.terminals.get(terminalId);
    if (!entry || entry.terminated) return;

    // Don't schedule if a frontend is already attached
    if (entry.frontendWs) return;

    this.cancelOrphanCleanup(terminalId);
    entry.orphanTimer = setTimeout(() => {
      entry.orphanTimer = null;
      // If still no frontend attached, destroy the terminal
      if (!entry.frontendWs && !entry.terminated) {
        console.log(`[terminal-relay] orphan cleanup: destroying terminal ${terminalId}`);
        this.destroyTerminal(terminalId);
      }
    }, TerminalRelay.ORPHAN_TIMEOUT_MS);
  }

  private cancelOrphanCleanup(terminalId: string): void {
    const entry = this.terminals.get(terminalId);
    if (entry?.orphanTimer) {
      clearTimeout(entry.orphanTimer);
      entry.orphanTimer = null;
    }
  }

  private removeTerminal(terminalId: string): void {
    const entry = this.terminals.get(terminalId);
    if (entry) {
      this.cancelOrphanCleanup(terminalId);
      const ids = this.sessionTerminals.get(entry.sessionId);
      if (ids) {
        ids.delete(terminalId);
        if (ids.size === 0) this.sessionTerminals.delete(entry.sessionId);
      }
      if (entry.sessionGroupId) {
        const groupIds = this.sessionGroupTerminals.get(entry.sessionGroupId);
        if (groupIds) {
          groupIds.delete(terminalId);
          if (groupIds.size === 0) this.sessionGroupTerminals.delete(entry.sessionGroupId);
        }
      }
    }
    this.terminals.delete(terminalId);
  }
}

export const terminalRelay = new TerminalRelay();
