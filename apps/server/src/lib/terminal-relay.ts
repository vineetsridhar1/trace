import { randomUUID } from "crypto";
import type WebSocket from "ws";
import type { BridgeActiveTerminal } from "@trace/shared";
import { prisma } from "./db.js";
import { sessionRouter } from "./session-router.js";

/**
 * Where a terminal lives. Session-scoped terminals run in a session group's
 * side worktree; channel-scoped terminals run on the main worktree of the
 * channel's repo on a specific bridge.
 */
export type TerminalScope =
  | { kind: "session"; sessionId: string; sessionGroupId: string | null }
  | { kind: "channel"; channelId: string; repoId: string };

interface TerminalEntry {
  scope: TerminalScope;
  /**
   * The runtime this terminal lives on. Every terminal command is pinned to
   * this runtime — without it, outbound commands could fall through to a
   * different bridge via session-router auto-bind, leaking PTYs cross-tenant.
   */
  runtimeInstanceId: string;
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
  /** Reverse index: channelId → Set<terminalId> for channel-scoped terminal tabs */
  private channelTerminals = new Map<string, Set<string>>();

  /**
   * Create a terminal on the bridge for a given session.
   * Returns the terminalId that the frontend uses to attach.
   */
  createTerminal(
    sessionId: string,
    sessionGroupId: string | null,
    runtimeInstanceId: string,
    cols: number,
    rows: number,
    cwd?: string,
  ): string {
    const terminalId = randomUUID();
    this.storeEntry(terminalId, {
      scope: { kind: "session", sessionId, sessionGroupId },
      runtimeInstanceId,
    });

    // Send terminal_create command to the bridge, pinned to the authorized runtime.
    const result = sessionRouter.send(
      sessionId,
      {
        type: "terminal_create",
        terminalId,
        sessionId,
        cols,
        rows,
        cwd: cwd ?? "",
      },
      { expectedHomeRuntimeId: runtimeInstanceId },
    );

    if (result !== "delivered") {
      const errorMsg = JSON.stringify({ type: "error", message: `Terminal creation failed: ${result}` });
      const entry = this.terminals.get(terminalId);
      if (entry) entry.buffer.push(errorMsg);
    }

    return terminalId;
  }

  /**
   * Create a terminal on a specific bridge runtime rooted in the main worktree
   * of a channel's repo. Caller is responsible for authorization; this method
   * just wires up the relay entry and dispatches the create command.
   */
  createChannelTerminal(input: {
    channelId: string;
    repoId: string;
    runtimeInstanceId: string;
    cols: number;
    rows: number;
  }): string {
    const terminalId = randomUUID();
    this.storeEntry(terminalId, {
      scope: { kind: "channel", channelId: input.channelId, repoId: input.repoId },
      runtimeInstanceId: input.runtimeInstanceId,
    });

    const result = sessionRouter.sendToRuntime(input.runtimeInstanceId, {
      type: "terminal_create",
      terminalId,
      channelId: input.channelId,
      repoId: input.repoId,
      cols: input.cols,
      rows: input.rows,
    });

    if (result !== "delivered") {
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
    runtimeInstanceId: string,
    command: string,
    cwd?: string,
    timeoutMs = 300_000,
  ): Promise<number> {
    return new Promise((resolve, reject) => {
      const terminalId = this.createTerminal(
        sessionId,
        sessionGroupId,
        runtimeInstanceId,
        80,
        24,
        cwd,
      );
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
        sessionRouter.send(
          sessionId,
          {
            type: "terminal_input",
            terminalId,
            data: command + "\n",
          },
          { expectedHomeRuntimeId: runtimeInstanceId },
        );
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
  async restoreTerminals(
    runtimeInstanceId: string,
    terminals: BridgeActiveTerminal[],
  ): Promise<void> {
    const sessionIds = [
      ...new Set(
        terminals
          .map((t) => ("sessionId" in t ? t.sessionId : null))
          .filter((id): id is string => id !== null),
      ),
    ];
    const sessions =
      sessionIds.length === 0
        ? []
        : await prisma.session.findMany({
            where: { id: { in: sessionIds } },
            select: { id: true, sessionGroupId: true },
          });
    const sessionGroupIds = new Map<string, string | null>(
      sessions.map((session: { id: string; sessionGroupId: string | null }) => [
        session.id,
        session.sessionGroupId ?? null,
      ]),
    );

    for (const entryDesc of terminals) {
      if (this.terminals.has(entryDesc.terminalId)) continue;
      const scope: TerminalScope =
        "sessionId" in entryDesc
          ? {
              kind: "session",
              sessionId: entryDesc.sessionId,
              sessionGroupId: sessionGroupIds.get(entryDesc.sessionId) ?? null,
            }
          : {
              kind: "channel",
              channelId: entryDesc.channelId,
              repoId: entryDesc.repoId,
            };

      this.storeEntry(entryDesc.terminalId, {
        scope,
        runtimeInstanceId,
        ready: true, // Bridge says it's alive, so it's ready
      });

      this.scheduleOrphanCleanup(entryDesc.terminalId);
    }
  }

  /** Returns non-terminated terminal IDs for a session. */
  getTerminalsForSession(sessionId: string): string[] {
    return this.filterAlive(this.sessionTerminals.get(sessionId));
  }

  /** Returns non-terminated terminal IDs for a session group. */
  getTerminalsForSessionGroup(sessionGroupId: string): string[] {
    return this.filterAlive(this.sessionGroupTerminals.get(sessionGroupId));
  }

  /** Returns non-terminated terminal IDs for a channel. */
  getTerminalsForChannel(channelId: string): string[] {
    return this.filterAlive(this.channelTerminals.get(channelId));
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

  /** Get the scope for a terminal (used by handlers that need to branch on kind). */
  getScope(terminalId: string): TerminalScope | undefined {
    return this.terminals.get(terminalId)?.scope;
  }

  /**
   * Get the sessionId for a session-scoped terminal. Returns undefined for
   * channel terminals. Session-era callers that used this as a boolean check
   * for "terminal exists" should migrate to `getScope`.
   */
  getSessionId(terminalId: string): string | undefined {
    const scope = this.terminals.get(terminalId)?.scope;
    return scope?.kind === "session" ? scope.sessionId : undefined;
  }

  getSessionGroupId(terminalId: string): string | undefined {
    const scope = this.terminals.get(terminalId)?.scope;
    return scope?.kind === "session" ? scope.sessionGroupId ?? undefined : undefined;
  }

  /**
   * The runtime this terminal was authorized against at creation time. The
   * frontend attach path MUST use this (not the session's DB connection) when
   * checking access, because the session's connection can be cleared or lag
   * behind, and attach needs to authorize against the bridge that actually
   * owns the PTY.
   */
  getRuntimeInstanceId(terminalId: string): string | undefined {
    return this.terminals.get(terminalId)?.runtimeInstanceId;
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
      sessionRouter.sendToRuntime(entry.runtimeInstanceId, {
        type: "terminal_input",
        terminalId,
        data: payload.data as string,
      });
    } else if (type === "resize") {
      sessionRouter.sendToRuntime(entry.runtimeInstanceId, {
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

    sessionRouter.sendToRuntime(entry.runtimeInstanceId, {
      type: "terminal_destroy",
      terminalId,
    });

    this.removeTerminal(terminalId);
  }

  /** Destroy all terminals for a session (called on session destroy/disconnect). */
  destroyAllForSession(sessionId: string): void {
    const ids = this.sessionTerminals.get(sessionId);
    if (!ids) return;
    for (const terminalId of [...ids]) {
      this.destroyTerminalInternal(terminalId);
    }
  }

  destroyAllForSessionGroup(sessionGroupId: string): void {
    const ids = this.sessionGroupTerminals.get(sessionGroupId);
    if (!ids) return;
    for (const terminalId of [...ids]) {
      this.destroyTerminalInternal(terminalId);
    }
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
   * Destroy terminals attached by a specific user whose scope matches the
   * given filters. Called when a bridge access grant is revoked — closes
   * the grantee's frontend WS immediately and tears down the PTY on the
   * bridge side.
   *
   * - `sessionIds`: when set, session-scoped terminals are matched only if
   *   their sessionId is in this set. Leave undefined to match all.
   * - `runtimeInstanceId`: when set, only terminals pinned to this runtime
   *   are affected. Required so revoking one bridge's grant doesn't touch
   *   terminals on other bridges the user still has access to.
   * - `includeChannelTerminals`: channel terminals have no session — they
   *   only live on a runtime. Include them only when the revocation covers
   *   the entire bridge (all_sessions scope), not a session_group scope.
   */
  destroyTerminalsForUser(
    userId: string,
    options: {
      sessionIds?: Set<string>;
      runtimeInstanceId?: string;
      includeChannelTerminals?: boolean;
    } = {},
  ): void {
    const { sessionIds, runtimeInstanceId, includeChannelTerminals } = options;
    for (const [terminalId, entry] of this.terminals) {
      if (entry.attachedUserId !== userId) continue;
      if (runtimeInstanceId && entry.runtimeInstanceId !== runtimeInstanceId) continue;
      if (entry.scope.kind === "session") {
        if (sessionIds && !sessionIds.has(entry.scope.sessionId)) continue;
      } else {
        if (!includeChannelTerminals) continue;
      }
      if (entry.frontendWs && entry.frontendWs.readyState === entry.frontendWs.OPEN) {
        entry.frontendWs.send(
          JSON.stringify({ type: "error", message: "Bridge access revoked" }),
        );
        entry.frontendWs.close(1008, "Bridge access revoked");
      }
      this.destroyTerminal(terminalId);
    }
  }

  private storeEntry(
    terminalId: string,
    init: {
      scope: TerminalScope;
      runtimeInstanceId: string;
      ready?: boolean;
    },
  ): void {
    this.terminals.set(terminalId, {
      scope: init.scope,
      runtimeInstanceId: init.runtimeInstanceId,
      frontendWs: null,
      attachedUserId: null,
      ready: init.ready ?? false,
      terminated: false,
      buffer: [],
      scrollback: [],
      scrollbackBytes: 0,
      orphanTimer: null,
    });
    this.addToReverseIndexes(terminalId, init.scope);
  }

  private addToReverseIndexes(terminalId: string, scope: TerminalScope): void {
    if (scope.kind === "session") {
      const ids = this.sessionTerminals.get(scope.sessionId) ?? new Set();
      ids.add(terminalId);
      this.sessionTerminals.set(scope.sessionId, ids);
      if (scope.sessionGroupId) {
        const groupIds = this.sessionGroupTerminals.get(scope.sessionGroupId) ?? new Set();
        groupIds.add(terminalId);
        this.sessionGroupTerminals.set(scope.sessionGroupId, groupIds);
      }
    } else {
      const ids = this.channelTerminals.get(scope.channelId) ?? new Set();
      ids.add(terminalId);
      this.channelTerminals.set(scope.channelId, ids);
    }
  }

  private filterAlive(ids: Set<string> | undefined): string[] {
    if (!ids) return [];
    const result: string[] = [];
    for (const id of ids) {
      const entry = this.terminals.get(id);
      if (entry && !entry.terminated) result.push(id);
    }
    return result;
  }

  /** Shared teardown helper used by bulk destroy paths. */
  private destroyTerminalInternal(terminalId: string): void {
    const entry = this.terminals.get(terminalId);
    if (!entry) return;
    sessionRouter.sendToRuntime(entry.runtimeInstanceId, {
      type: "terminal_destroy",
      terminalId,
    });
    if (entry.frontendWs && entry.frontendWs.readyState === entry.frontendWs.OPEN) {
      entry.frontendWs.send(JSON.stringify({ type: "exit", exitCode: -1 }));
    }
    this.cancelOrphanCleanup(terminalId);
    this.removeTerminal(terminalId);
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
      if (entry.scope.kind === "session") {
        const sessionIds = this.sessionTerminals.get(entry.scope.sessionId);
        if (sessionIds) {
          sessionIds.delete(terminalId);
          if (sessionIds.size === 0) this.sessionTerminals.delete(entry.scope.sessionId);
        }
        if (entry.scope.sessionGroupId) {
          const groupIds = this.sessionGroupTerminals.get(entry.scope.sessionGroupId);
          if (groupIds) {
            groupIds.delete(terminalId);
            if (groupIds.size === 0) this.sessionGroupTerminals.delete(entry.scope.sessionGroupId);
          }
        }
      } else {
        const channelIds = this.channelTerminals.get(entry.scope.channelId);
        if (channelIds) {
          channelIds.delete(terminalId);
          if (channelIds.size === 0) this.channelTerminals.delete(entry.scope.channelId);
        }
      }
    }
    this.terminals.delete(terminalId);
  }
}

export const terminalRelay = new TerminalRelay();
