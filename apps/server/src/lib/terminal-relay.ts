import { randomUUID } from "crypto";
import type WebSocket from "ws";
import { prisma } from "./db.js";
import { sessionRouter } from "./session-router.js";
import { terminalDirectory } from "./terminal-directory.js";
import { realtimeBackplane } from "./realtime-backplane.js";

interface TerminalEntry {
  sessionId: string;
  sessionGroupId: string | null;
  kind: "session" | "channel";
  channelId?: string;
  organizationId?: string;
  repoId?: string;
  /**
   * The runtime this terminal lives on. Every terminal command is pinned to
   * this runtime via `expectedHomeRuntimeId` — without it, an unbound session
   * would silently auto-bind to any connected bridge and leak the PTY to
   * another user's machine.
   */
  runtimeInstanceId: string;
  /** User that created the terminal. Frontend attach/list/destroy is owner-only. */
  ownerUserId: string | null;
  frontendWs: WebSocket | null;
  remoteFrontendReplicaId?: string;
  remoteFrontendAttachmentId?: string;
  /** User who currently has a frontend WebSocket attached to this terminal. */
  attachedUserId: string | null;
  ready: boolean;
  /** True once the bridge has sent terminal_exit or terminal_error */
  terminated: boolean;
  cols: number;
  rows: number;
  /** Messages buffered before the frontend attaches */
  buffer: string[];
  /** Ring buffer of raw output chunks for scrollback replay on reconnect */
  scrollback: string[];
  /** Running byte total of scrollback chunks */
  scrollbackBytes: number;
  /** True after a frontend has attached at least once. */
  hasEverAttached: boolean;
  /** Timer to kill terminals that were created but never attached. */
  orphanTimer: ReturnType<typeof setTimeout> | null;
  /** Optional server-side callbacks for terminal lifecycle events */
  onReady?: () => void;
  onEnd?: (exitCode: number | null, error?: string) => void;
}

/**
 * Relays terminal I/O between frontend WebSocket clients and bridge runtimes.
 * No persistence — terminal data is ephemeral and never hits the event store.
 */
export class TerminalRelay {
  /** If no frontend ever attaches within this window, kill the orphaned terminal. */
  private static ORPHAN_TIMEOUT_MS = 30 * 60 * 1000;
  /** Max scrollback buffer size in bytes — older output is trimmed from the front. */
  private static MAX_SCROLLBACK_BYTES = 50 * 1024;

  private terminals = new Map<string, TerminalEntry & { runtimeKey: string }>();
  /** Reverse index: sessionId → Set<terminalId> for bulk cleanup */
  private sessionTerminals = new Map<string, Set<string>>();
  /** Reverse index: sessionGroupId → Set<terminalId> for group-scoped terminal tabs */
  private sessionGroupTerminals = new Map<string, Set<string>>();
  /** Reverse index for repo/channel terminals on a specific runtime. */
  private channelTerminals = new Map<string, Set<string>>();
  private remoteFrontendSockets = new Map<string, { ws: WebSocket; attachmentId: string }>();
  private pendingOperations = new Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private static OPERATION_TIMEOUT_MS = 5_000;

  constructor() {
    realtimeBackplane.on("terminal_operation_response", (envelope) => {
      const input = this.backplanePayload(envelope.payload);
      if (!input || typeof input.requestId !== "string") return;
      const pending = this.pendingOperations.get(input.requestId);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pendingOperations.delete(input.requestId);
      if (input.error === "closed") pending.reject(new Error("Terminal is closed"));
      else if (input.error === "not_found") pending.reject(new Error("Terminal not found"));
      else pending.resolve(input.result);
    });
    realtimeBackplane.on("terminal_operation_request", async (envelope) => {
      const input = this.backplanePayload(envelope.payload);
      if (
        !input ||
        typeof input.requestId !== "string" ||
        typeof input.terminalId !== "string" ||
        typeof input.action !== "string"
      )
        return;
      let result: unknown = true;
      let error: "closed" | "not_found" | undefined;
      if (input.action === "capture" && typeof input.maxBytes === "number") {
        result = this.captureTerminal(input.terminalId, input.maxBytes);
        if (!result) error = "not_found";
      } else if (input.action === "input" && typeof input.data === "string") {
        if (!this.sendInput(input.terminalId, input.data))
          error = this.terminals.has(input.terminalId) ? "closed" : "not_found";
      } else if (
        input.action === "resize" &&
        typeof input.cols === "number" &&
        typeof input.rows === "number"
      ) {
        if (!this.resizeTerminal(input.terminalId, input.cols, input.rows))
          error = this.terminals.has(input.terminalId) ? "closed" : "not_found";
      } else if (input.action === "destroy") {
        if (!this.terminals.has(input.terminalId)) error = "not_found";
        else this.destroyTerminal(input.terminalId);
      } else return;
      await realtimeBackplane.send(envelope.sourceReplicaId, "terminal_operation_response", {
        requestId: input.requestId,
        result,
        error,
      });
    });
    realtimeBackplane.on("terminal_bridge_message", (envelope) => {
      const payload = envelope.payload;
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) return;
      const input = payload as Record<string, unknown>;
      if (
        typeof input.sourceRuntimeInstanceId !== "string" ||
        !input.message ||
        typeof input.message !== "object" ||
        Array.isArray(input.message)
      ) {
        return;
      }
      const message = input.message as { type: string; terminalId: string; [key: string]: unknown };
      void this.relayFromBridge(
        message,
        input.sourceRuntimeInstanceId,
        typeof input.connectionGeneration === "string" ? input.connectionGeneration : undefined,
      );
    });
    realtimeBackplane.on("terminal_frontend_attach", (envelope) => {
      const input = this.backplanePayload(envelope.payload);
      if (
        !input ||
        typeof input.terminalId !== "string" ||
        typeof input.attachmentId !== "string" ||
        typeof input.userId !== "string"
      )
        return;
      const entry = this.terminals.get(input.terminalId);
      if (!entry) return;
      entry.frontendWs = null;
      entry.remoteFrontendReplicaId = envelope.sourceReplicaId;
      entry.remoteFrontendAttachmentId = input.attachmentId;
      entry.attachedUserId = input.userId;
      entry.hasEverAttached = true;
      this.cancelOrphanCleanup(input.terminalId);
      const messages = [
        ...(entry.scrollback.length > 0
          ? [JSON.stringify({ type: "output", data: entry.scrollback.join("") })]
          : []),
        ...entry.buffer,
        ...(entry.ready ? [JSON.stringify({ type: "ready" })] : []),
      ];
      entry.buffer = [];
      void realtimeBackplane.send(envelope.sourceReplicaId, "terminal_frontend_messages", {
        terminalId: input.terminalId,
        attachmentId: input.attachmentId,
        messages,
      });
    });
    realtimeBackplane.on("terminal_frontend_messages", (envelope) => {
      const input = this.backplanePayload(envelope.payload);
      if (
        !input ||
        typeof input.terminalId !== "string" ||
        typeof input.attachmentId !== "string" ||
        !Array.isArray(input.messages)
      )
        return;
      const attachment = this.remoteFrontendSockets.get(input.terminalId);
      if (
        !attachment ||
        attachment.attachmentId !== input.attachmentId ||
        attachment.ws.readyState !== attachment.ws.OPEN
      )
        return;
      for (const message of input.messages) {
        if (typeof message === "string") attachment.ws.send(message);
      }
    });
    realtimeBackplane.on("terminal_frontend_command", (envelope) => {
      const input = this.backplanePayload(envelope.payload);
      if (
        !input ||
        typeof input.terminalId !== "string" ||
        typeof input.attachmentId !== "string" ||
        (input.commandType !== "input" && input.commandType !== "resize") ||
        !input.payload ||
        typeof input.payload !== "object" ||
        Array.isArray(input.payload)
      ) {
        return;
      }
      const entry = this.terminals.get(input.terminalId);
      if (
        !entry ||
        entry.remoteFrontendReplicaId !== envelope.sourceReplicaId ||
        entry.remoteFrontendAttachmentId !== input.attachmentId
      )
        return;
      this.relayFromFrontend(
        input.terminalId,
        input.commandType,
        input.payload as Record<string, unknown>,
      );
    });
    realtimeBackplane.on("terminal_frontend_detach", (envelope) => {
      const input = this.backplanePayload(envelope.payload);
      if (!input || typeof input.terminalId !== "string" || typeof input.attachmentId !== "string")
        return;
      const entry = this.terminals.get(input.terminalId);
      if (
        entry?.remoteFrontendReplicaId === envelope.sourceReplicaId &&
        entry.remoteFrontendAttachmentId === input.attachmentId
      ) {
        entry.remoteFrontendReplicaId = undefined;
        entry.remoteFrontendAttachmentId = undefined;
        entry.attachedUserId = null;
        this.scheduleOrphanCleanup(input.terminalId);
      }
    });
  }

  /**
   * Create a terminal on the bridge for a given session.
   * Returns the terminalId that the frontend uses to attach.
   *
   * `runtimeInstanceId` pins the terminal to the session's home runtime so
   * the PTY command can never fall through to a cross-tenant bridge via
   * session-router auto-bind. The caller is responsible for authorizing the
   * user against this runtime before we create a PTY on it.
   */
  createTerminal(
    sessionId: string,
    sessionGroupId: string | null,
    organizationId: string | null,
    runtimeInstanceId: string,
    ownerUserId: string,
    cols: number,
    rows: number,
    cwd?: string,
  ): string {
    const terminalId = randomUUID();
    const runtimeKey = this.resolveRuntimeKey(runtimeInstanceId, organizationId);

    this.terminals.set(terminalId, {
      sessionId,
      sessionGroupId,
      kind: "session",
      organizationId: organizationId ?? undefined,
      runtimeInstanceId,
      runtimeKey,
      ownerUserId,
      frontendWs: null,
      attachedUserId: null,
      ready: false,
      terminated: false,
      cols,
      rows,
      buffer: [],
      scrollback: [],
      scrollbackBytes: 0,
      hasEverAttached: false,
      orphanTimer: null,
    });
    terminalDirectory.register({
      terminalId,
      kind: "session",
      sessionId,
      sessionGroupId,
      ownerUserId,
      runtimeInstanceId,
      organizationId: organizationId ?? undefined,
      cols,
      rows,
    });
    const ids = this.sessionTerminals.get(sessionId) ?? new Set();
    ids.add(terminalId);
    this.sessionTerminals.set(sessionId, ids);
    if (sessionGroupId) {
      const groupIds = this.sessionGroupTerminals.get(sessionGroupId) ?? new Set();
      groupIds.add(terminalId);
      this.sessionGroupTerminals.set(sessionGroupId, groupIds);
    }

    // Send terminal_create command to the bridge, pinned to the authorized runtime.
    const createDelivery = sessionRouter.sendAsync(
      sessionId,
      {
        type: "terminal_create",
        terminalId,
        sessionId,
        ownerUserId,
        cols,
        rows,
        cwd: cwd ?? "",
      },
      { expectedHomeRuntimeId: runtimeInstanceId, organizationId },
    );
    void createDelivery.then((result) => {
      if (result === "delivered") return;
      // Bridge not available — buffer an error so the frontend gets feedback on attach
      const errorMsg = JSON.stringify({
        type: "error",
        message: `Terminal creation failed: ${result}`,
      });
      const entry = this.terminals.get(terminalId);
      if (entry) entry.buffer.push(errorMsg);
    });

    return terminalId;
  }

  createChannelTerminal(
    channelId: string,
    organizationId: string,
    repoId: string,
    runtimeInstanceId: string,
    ownerUserId: string,
    cols: number,
    rows: number,
    cwd: string,
  ): string {
    const terminalId = randomUUID();
    const sessionId = `channel:${channelId}`;
    const runtimeKey = this.resolveRuntimeKey(runtimeInstanceId, organizationId);

    this.terminals.set(terminalId, {
      sessionId,
      sessionGroupId: null,
      kind: "channel",
      channelId,
      organizationId,
      repoId,
      runtimeInstanceId,
      runtimeKey,
      ownerUserId,
      frontendWs: null,
      attachedUserId: null,
      ready: false,
      terminated: false,
      cols,
      rows,
      buffer: [],
      scrollback: [],
      scrollbackBytes: 0,
      hasEverAttached: false,
      orphanTimer: null,
    });
    terminalDirectory.register({
      terminalId,
      kind: "channel",
      sessionId,
      sessionGroupId: null,
      channelId,
      repoId,
      ownerUserId,
      runtimeInstanceId,
      organizationId,
      cols,
      rows,
    });

    const sessionIds = this.sessionTerminals.get(sessionId) ?? new Set();
    sessionIds.add(terminalId);
    this.sessionTerminals.set(sessionId, sessionIds);
    const channelKey = this.channelTerminalKey(channelId, runtimeInstanceId);
    const channelIds = this.channelTerminals.get(channelKey) ?? new Set();
    channelIds.add(terminalId);
    this.channelTerminals.set(channelKey, channelIds);

    void sessionRouter
      .sendToRuntimeAsync(
        runtimeInstanceId,
        {
          type: "terminal_create",
          terminalId,
          sessionId,
          ownerUserId,
          cols,
          rows,
          cwd,
        },
        organizationId,
      )
      .then((result) => {
        if (result === "delivered") return;
        const entry = this.terminals.get(terminalId);
        if (entry) {
          entry.buffer.push(
            JSON.stringify({ type: "error", message: `Terminal creation failed: ${result}` }),
          );
        }
      });

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
    organizationId: string | null,
    runtimeInstanceId: string,
    command: string,
    cwd?: string,
    timeoutMs = 300_000,
  ): Promise<number> {
    return new Promise((resolve, reject) => {
      const terminalId = this.createTerminal(
        sessionId,
        sessionGroupId,
        organizationId,
        runtimeInstanceId,
        "system",
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
        void sessionRouter.sendAsync(
          sessionId,
          {
            type: "terminal_input",
            terminalId,
            data: command + "\n",
          },
          { expectedHomeRuntimeId: runtimeInstanceId, organizationId: entry.organizationId },
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
   * Skips entries that already exist. Restored terminals already existed on
   * the bridge, so keep them alive until explicit destroy or process exit.
   */
  async restoreTerminals(
    runtimeKey: string,
    terminals: Array<{ terminalId: string; sessionId: string; ownerUserId: string }>,
  ): Promise<void> {
    const runtime = sessionRouter.getRuntime(runtimeKey);
    const runtimeInstanceId = runtime?.id ?? runtimeKey;
    const runtimeOrganizationId = runtime?.organizationId;
    const channelPrefix = "channel:";
    const sessionIds = [
      ...new Set(
        terminals
          .map(({ sessionId }) => sessionId)
          .filter((sessionId) => !sessionId.startsWith(channelPrefix)),
      ),
    ];
    const channelIds = [
      ...new Set(
        terminals
          .map(({ sessionId }) => sessionId)
          .filter((sessionId) => sessionId.startsWith(channelPrefix))
          .map((sessionId) => sessionId.slice(channelPrefix.length)),
      ),
    ];
    const sessions =
      sessionIds.length === 0
        ? []
        : await prisma.session.findMany({
            where: {
              id: { in: sessionIds },
              ...(runtimeOrganizationId ? { organizationId: runtimeOrganizationId } : {}),
            },
            select: { id: true, sessionGroupId: true, organizationId: true },
          });
    const channels =
      channelIds.length === 0
        ? []
        : await prisma.channel.findMany({
            where: {
              id: { in: channelIds },
              ...(runtimeOrganizationId ? { organizationId: runtimeOrganizationId } : {}),
            },
            select: { id: true, organizationId: true, repoId: true },
          });
    const sessionContexts = new Map<
      string,
      { sessionGroupId: string | null; organizationId: string | null }
    >(
      sessions.map(
        (session: { id: string; sessionGroupId: string | null; organizationId: string }) => [
          session.id,
          {
            sessionGroupId: session.sessionGroupId ?? null,
            organizationId: session.organizationId ?? runtimeOrganizationId ?? null,
          },
        ],
      ),
    );
    const channelsById = new Map(channels.map((channel) => [channel.id, channel]));

    for (const { terminalId, sessionId, ownerUserId } of terminals) {
      if (this.terminals.has(terminalId)) continue;
      if (sessionId.startsWith(channelPrefix)) {
        const channelId = sessionId.slice(channelPrefix.length);
        const channel = channelsById.get(channelId);
        if (!channel?.repoId) continue;

        this.terminals.set(terminalId, {
          sessionId,
          sessionGroupId: null,
          kind: "channel",
          channelId,
          organizationId: channel.organizationId,
          repoId: channel.repoId,
          runtimeInstanceId,
          runtimeKey,
          ownerUserId,
          frontendWs: null,
          attachedUserId: null,
          ready: true,
          terminated: false,
          cols: 80,
          rows: 24,
          buffer: [],
          scrollback: [],
          scrollbackBytes: 0,
          hasEverAttached: true,
          orphanTimer: null,
        });
        terminalDirectory.register({
          terminalId,
          kind: "channel",
          sessionId,
          sessionGroupId: null,
          channelId,
          organizationId: channel.organizationId,
          repoId: channel.repoId,
          ownerUserId,
          runtimeInstanceId,
          cols: 80,
          rows: 24,
        });

        const sessionTerminals = this.sessionTerminals.get(sessionId) ?? new Set();
        sessionTerminals.add(terminalId);
        this.sessionTerminals.set(sessionId, sessionTerminals);

        const channelKey = this.channelTerminalKey(channelId, runtimeInstanceId);
        const channelTerminals = this.channelTerminals.get(channelKey) ?? new Set();
        channelTerminals.add(terminalId);
        this.channelTerminals.set(channelKey, channelTerminals);
        continue;
      }

      const sessionContext = sessionContexts.get(sessionId);
      if (!sessionContext) continue;
      const sessionGroupId = sessionContext?.sessionGroupId ?? null;

      this.terminals.set(terminalId, {
        sessionId,
        sessionGroupId,
        kind: "session",
        organizationId: sessionContext?.organizationId ?? runtimeOrganizationId,
        runtimeInstanceId,
        runtimeKey,
        ownerUserId,
        frontendWs: null,
        attachedUserId: null,
        ready: true, // Bridge says it's alive, so it's ready
        terminated: false,
        cols: 80,
        rows: 24,
        buffer: [],
        scrollback: [],
        scrollbackBytes: 0,
        hasEverAttached: true,
        orphanTimer: null,
      });
      terminalDirectory.register({
        terminalId,
        kind: "session",
        sessionId,
        sessionGroupId,
        organizationId: sessionContext?.organizationId ?? runtimeOrganizationId,
        ownerUserId,
        runtimeInstanceId,
        cols: 80,
        rows: 24,
      });

      const ids = this.sessionTerminals.get(sessionId) ?? new Set();
      ids.add(terminalId);
      this.sessionTerminals.set(sessionId, ids);
      if (sessionGroupId) {
        const groupIds = this.sessionGroupTerminals.get(sessionGroupId) ?? new Set();
        groupIds.add(terminalId);
        this.sessionGroupTerminals.set(sessionGroupId, groupIds);
      }
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

  getTerminalsForChannel(channelId: string, runtimeInstanceId: string): string[] {
    const ids = this.channelTerminals.get(this.channelTerminalKey(channelId, runtimeInstanceId));
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
    entry.remoteFrontendReplicaId = undefined;
    entry.remoteFrontendAttachmentId = undefined;
    entry.attachedUserId = userId;
    entry.hasEverAttached = true;
    const hadBufferedReady = entry.buffer.some((msg) => msg.includes('"type":"ready"'));

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

  async attachFrontendDistributed(
    terminalId: string,
    ws: WebSocket,
    userId: string,
  ): Promise<boolean> {
    if (this.attachFrontend(terminalId, ws, userId)) return true;
    const descriptor = await terminalDirectory.get(terminalId);
    if (!descriptor || descriptor.frontendReplicaId === realtimeBackplane.replicaId) return false;
    const attachmentId = randomUUID();
    this.remoteFrontendSockets.set(terminalId, { ws, attachmentId });
    await realtimeBackplane.send(descriptor.frontendReplicaId, "terminal_frontend_attach", {
      terminalId,
      attachmentId,
      userId,
    });
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

  getTerminalAuthContext(terminalId: string):
    | {
        kind: "session";
        sessionId: string;
        sessionGroupId: string | null;
        runtimeInstanceId: string;
        ownerUserId: string | null;
      }
    | {
        kind: "channel";
        channelId: string;
        organizationId: string;
        repoId: string;
        runtimeInstanceId: string;
        ownerUserId: string | null;
      }
    | null {
    const entry = this.terminals.get(terminalId);
    if (!entry) return null;
    if (entry.kind === "channel") {
      if (!entry.channelId || !entry.organizationId || !entry.repoId) return null;
      return {
        kind: "channel",
        channelId: entry.channelId,
        organizationId: entry.organizationId,
        repoId: entry.repoId,
        runtimeInstanceId: entry.runtimeInstanceId,
        ownerUserId: entry.ownerUserId,
      };
    }
    return {
      kind: "session",
      sessionId: entry.sessionId,
      sessionGroupId: entry.sessionGroupId,
      runtimeInstanceId: entry.runtimeInstanceId,
      ownerUserId: entry.ownerUserId,
    };
  }

  getTerminalState(
    terminalId: string,
  ): {
    id: string;
    sessionId: string;
    status: string;
    cols: number;
    rows: number;
    connected: boolean;
    closed: boolean;
  } | null {
    const entry = this.terminals.get(terminalId);
    if (!entry) return null;
    return {
      id: terminalId,
      sessionId: entry.sessionId,
      status: entry.terminated ? "closed" : entry.ready ? "ready" : "connecting",
      cols: entry.cols,
      rows: entry.rows,
      connected:
        !entry.terminated &&
        sessionRouter.isRuntimeAvailable(entry.runtimeInstanceId, entry.organizationId),
      closed: entry.terminated,
    };
  }

  captureTerminal(
    terminalId: string,
    maxBytes: number,
  ): {
    output: string;
    byteCount: number;
    truncated: boolean;
    closed: boolean;
    connected: boolean;
  } | null {
    const entry = this.terminals.get(terminalId);
    if (!entry) return null;
    const source = entry.scrollback.join("");
    const bytes = Buffer.byteLength(source);
    const truncated = bytes > maxBytes;
    const output = truncated ? this.utf8Tail(source, maxBytes) : source;
    return {
      output,
      byteCount: Buffer.byteLength(output),
      truncated,
      closed: entry.terminated,
      connected:
        !entry.terminated &&
        sessionRouter.isRuntimeAvailable(entry.runtimeInstanceId, entry.organizationId),
    };
  }

  async captureTerminalDistributed(terminalId: string, maxBytes: number) {
    const local = this.captureTerminal(terminalId, maxBytes);
    if (local) return local;
    return this.requestOperation(terminalId, { action: "capture", maxBytes });
  }

  sendInput(terminalId: string, data: string): boolean {
    const entry = this.terminals.get(terminalId);
    if (!entry || entry.terminated) return false;
    this.sendTerminalCommand(entry, { type: "terminal_input", terminalId, data });
    return true;
  }

  async sendInputDistributed(terminalId: string, data: string): Promise<boolean> {
    if (this.terminals.has(terminalId)) return this.sendInput(terminalId, data);
    await this.requestOperation(terminalId, { action: "input", data });
    return true;
  }

  resizeTerminal(terminalId: string, cols: number, rows: number): boolean {
    const entry = this.terminals.get(terminalId);
    if (!entry || entry.terminated) return false;
    entry.cols = cols;
    entry.rows = rows;
    terminalDirectory.refreshDimensions(terminalId, cols, rows);
    this.sendTerminalCommand(entry, { type: "terminal_resize", terminalId, cols, rows });
    return true;
  }

  async resizeTerminalDistributed(
    terminalId: string,
    cols: number,
    rows: number,
  ): Promise<boolean> {
    if (this.terminals.has(terminalId)) return this.resizeTerminal(terminalId, cols, rows);
    await this.requestOperation(terminalId, { action: "resize", cols, rows });
    return true;
  }

  async destroyTerminalDistributed(terminalId: string): Promise<void> {
    if (this.terminals.has(terminalId)) {
      this.destroyTerminal(terminalId);
      return;
    }
    await this.requestOperation(terminalId, { action: "destroy" });
  }

  async getTerminalAuthContextDistributed(
    terminalId: string,
  ): Promise<ReturnType<TerminalRelay["getTerminalAuthContext"]>> {
    const local = this.getTerminalAuthContext(terminalId);
    if (local) return local;
    const descriptor = await terminalDirectory.get(terminalId);
    if (!descriptor) return null;
    if (descriptor.kind === "channel") {
      if (!descriptor.channelId || !descriptor.organizationId || !descriptor.repoId) return null;
      return {
        kind: "channel",
        channelId: descriptor.channelId,
        organizationId: descriptor.organizationId,
        repoId: descriptor.repoId,
        runtimeInstanceId: descriptor.runtimeInstanceId,
        ownerUserId: descriptor.ownerUserId,
      };
    }
    return {
      kind: "session",
      sessionId: descriptor.sessionId,
      sessionGroupId: descriptor.sessionGroupId,
      runtimeInstanceId: descriptor.runtimeInstanceId,
      ownerUserId: descriptor.ownerUserId,
    };
  }

  /** Forward a message from the bridge to the attached frontend WebSocket. */
  async relayFromBridge(
    msg: { type: string; terminalId: string; [key: string]: unknown },
    sourceRuntimeInstanceId?: string,
    connectionGeneration?: string,
  ): Promise<void> {
    if (
      sourceRuntimeInstanceId &&
      connectionGeneration &&
      !sessionRouter.isRuntimeGenerationCurrent(sourceRuntimeInstanceId, connectionGeneration)
    ) {
      return;
    }
    const entry = this.terminals.get(msg.terminalId);
    if (!entry) {
      void terminalDirectory
        .get(msg.terminalId)
        .then((descriptor) => {
          if (!descriptor || descriptor.frontendReplicaId === realtimeBackplane.replicaId) return;
          return realtimeBackplane.send(descriptor.frontendReplicaId, "terminal_bridge_message", {
            sourceRuntimeInstanceId,
            connectionGeneration,
            message: msg,
          });
        })
        .catch((error) => console.error("[terminal-relay] forwarding failed:", error));
      return;
    }
    if (
      sourceRuntimeInstanceId &&
      entry.runtimeInstanceId !== sourceRuntimeInstanceId &&
      entry.runtimeKey !== sourceRuntimeInstanceId
    ) {
      return;
    }

    // Accumulate output into the scrollback ring buffer
    if (msg.type === "terminal_output") {
      const data = msg.data as string;
      entry.scrollback.push(data);
      entry.scrollbackBytes += Buffer.byteLength(data);
      // Trim oldest chunks when over budget
      while (
        entry.scrollbackBytes > TerminalRelay.MAX_SCROLLBACK_BYTES &&
        entry.scrollback.length > 1
      ) {
        entry.scrollbackBytes -= Buffer.byteLength(entry.scrollback.shift()!);
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

    if (entry.remoteFrontendReplicaId) {
      void realtimeBackplane.send(entry.remoteFrontendReplicaId, "terminal_frontend_messages", {
        terminalId: msg.terminalId,
        attachmentId: entry.remoteFrontendAttachmentId,
        messages: [serialized],
      });
      if (isTerminalEnd) this.removeTerminal(msg.terminalId);
    } else if (entry.frontendWs && entry.frontendWs.readyState === entry.frontendWs.OPEN) {
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
  relayFromFrontend(
    terminalId: string,
    type: "input" | "resize",
    payload: Record<string, unknown>,
  ): void {
    const entry = this.terminals.get(terminalId);
    if (!entry) {
      const attachment = this.remoteFrontendSockets.get(terminalId);
      if (!attachment) return;
      void terminalDirectory.get(terminalId).then((descriptor) => {
        if (!descriptor || descriptor.frontendReplicaId === realtimeBackplane.replicaId) return;
        return realtimeBackplane.send(descriptor.frontendReplicaId, "terminal_frontend_command", {
          terminalId,
          attachmentId: attachment.attachmentId,
          commandType: type,
          payload,
        });
      });
      return;
    }

    if (type === "input") {
      this.sendTerminalCommand(entry, {
        type: "terminal_input",
        terminalId,
        data: payload.data as string,
      });
    } else if (type === "resize") {
      this.sendTerminalCommand(entry, {
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

    this.sendTerminalCommand(entry, {
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
      this.sendTerminalCommand(entry, { type: "terminal_destroy", terminalId });
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
      terminalDirectory.remove(terminalId);
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
      this.sendTerminalCommand(entry, { type: "terminal_destroy", terminalId });
      if (entry.frontendWs && entry.frontendWs.readyState === entry.frontendWs.OPEN) {
        entry.frontendWs.send(JSON.stringify({ type: "exit", exitCode: -1 }));
      }
      this.cancelOrphanCleanup(terminalId);
      this.terminals.delete(terminalId);
      terminalDirectory.remove(terminalId);
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
    for (const [terminalId, attachment] of this.remoteFrontendSockets) {
      if (attachment.ws !== ws) continue;
      this.remoteFrontendSockets.delete(terminalId);
      void terminalDirectory.get(terminalId).then((descriptor) => {
        if (!descriptor || descriptor.frontendReplicaId === realtimeBackplane.replicaId) return;
        return realtimeBackplane.send(descriptor.frontendReplicaId, "terminal_frontend_detach", {
          terminalId,
          attachmentId: attachment.attachmentId,
        });
      });
    }
  }

  /**
   * Destroy terminals attached by a specific user whose session falls within
   * the given scope. Called when a bridge access grant is revoked — closes
   * the grantee's frontend WS immediately and tears down the PTY on the
   * bridge side.
   *
   * `sessionIds` scopes session terminals (for a session_group grant pass the
   * sessions in that group; for all_sessions pass undefined to match all).
   * `organizationId` scopes channel terminals — channel terminals use a
   * synthetic sessionId (`channel:<id>`) that is never in `sessionIds`, so
   * they must be matched separately.
   */
  destroyTerminalsForUser(userId: string, sessionIds?: Set<string>, organizationId?: string): void {
    for (const [terminalId, entry] of this.terminals) {
      if (entry.attachedUserId !== userId) continue;
      if (entry.kind === "channel") {
        // Channel terminals are scoped by organization, not by session.
        if (organizationId && entry.organizationId !== organizationId) continue;
      } else {
        if (sessionIds && !sessionIds.has(entry.sessionId)) continue;
      }
      if (entry.frontendWs && entry.frontendWs.readyState === entry.frontendWs.OPEN) {
        entry.frontendWs.send(JSON.stringify({ type: "error", message: "Bridge access revoked" }));
        entry.frontendWs.close(1008, "Bridge access revoked");
      } else if (entry.remoteFrontendReplicaId && entry.remoteFrontendAttachmentId) {
        void realtimeBackplane.send(entry.remoteFrontendReplicaId, "terminal_frontend_messages", {
          terminalId,
          attachmentId: entry.remoteFrontendAttachmentId,
          messages: [JSON.stringify({ type: "error", message: "Bridge access revoked" })],
        });
      }
      this.destroyTerminal(terminalId);
    }
  }

  private scheduleOrphanCleanup(terminalId: string): void {
    const entry = this.terminals.get(terminalId);
    if (!entry || entry.terminated) return;

    // Don't schedule if a frontend is already attached
    if (entry.frontendWs) return;
    // Once a terminal has been attached, it should live until explicit close,
    // process exit, or the shell exits. A transient browser/WebSocket detach
    // must not become a terminal kill timer.
    if (entry.hasEverAttached) return;

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

  private sendTerminalCommand(
    entry: TerminalEntry,
    command:
      | { type: "terminal_input"; terminalId: string; data: string }
      | { type: "terminal_resize"; terminalId: string; cols: number; rows: number }
      | { type: "terminal_destroy"; terminalId: string },
  ): void {
    if (entry.kind === "channel") {
      void sessionRouter.sendToRuntimeAsync(entry.runtimeInstanceId, command, entry.organizationId);
      return;
    }
    void sessionRouter.sendAsync(entry.sessionId, command, {
      expectedHomeRuntimeId: entry.runtimeInstanceId,
      organizationId: entry.organizationId,
    });
  }

  private channelTerminalKey(channelId: string, runtimeInstanceId: string): string {
    return `${channelId}:${runtimeInstanceId}`;
  }

  private resolveRuntimeKey(runtimeInstanceId: string, organizationId?: string | null): string {
    return sessionRouter.getRuntime(runtimeInstanceId, organizationId)?.key ?? runtimeInstanceId;
  }

  private backplanePayload(payload: unknown): Record<string, unknown> | null {
    return payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : null;
  }

  private utf8Tail(value: string, maxBytes: number): string {
    const bytes = Buffer.from(value, "utf8");
    let start = Math.max(0, bytes.length - maxBytes);
    while (start < bytes.length && (bytes[start]! & 0xc0) === 0x80) start += 1;
    return bytes.subarray(start).toString("utf8");
  }

  private async requestOperation(
    terminalId: string,
    input:
      | { action: "capture"; maxBytes: number }
      | { action: "input"; data: string }
      | { action: "resize"; cols: number; rows: number }
      | { action: "destroy" },
  ): Promise<unknown> {
    const descriptor = await terminalDirectory.get(terminalId);
    if (!descriptor) throw new Error("Terminal not found");
    if (descriptor.frontendReplicaId === realtimeBackplane.replicaId)
      throw new Error("Terminal not found");
    const requestId = randomUUID();
    const response = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingOperations.delete(requestId);
        reject(new Error("Terminal owning replica unavailable"));
      }, TerminalRelay.OPERATION_TIMEOUT_MS);
      this.pendingOperations.set(requestId, { resolve, reject, timer });
    });
    try {
      await realtimeBackplane.send(descriptor.frontendReplicaId, "terminal_operation_request", {
        requestId,
        terminalId,
        ...input,
      });
    } catch {
      const pending = this.pendingOperations.get(requestId);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingOperations.delete(requestId);
      }
      throw new Error("Terminal owning replica unavailable");
    }
    return response;
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
      if (entry.kind === "channel" && entry.channelId) {
        const channelKey = this.channelTerminalKey(entry.channelId, entry.runtimeInstanceId);
        const channelIds = this.channelTerminals.get(channelKey);
        if (channelIds) {
          channelIds.delete(terminalId);
          if (channelIds.size === 0) this.channelTerminals.delete(channelKey);
        }
      }
    }
    this.remoteFrontendSockets.delete(terminalId);
    this.terminals.delete(terminalId);
    terminalDirectory.remove(terminalId);
  }
}

export const terminalRelay = new TerminalRelay();
