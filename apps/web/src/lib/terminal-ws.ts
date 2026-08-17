const API_URL = import.meta.env.VITE_API_URL ?? "";
const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
const wsBase = API_URL
  ? API_URL.replace(/^https?:/, wsProtocol)
  : `${wsProtocol}//${window.location.host}`;
const FATAL_TERMINAL_ERRORS = new Set([
  "Unauthorized",
  "Invalid token",
  "Terminal not found",
  "Access denied",
]);
const FATAL_TERMINAL_CLOSE_CODES = new Set([1008]);

export type TerminalSocketEvent =
  | { type: "ready" }
  | { type: "output"; data: string }
  | { type: "exit"; exitCode: number }
  | { type: "error"; message: string }
  | { type: "disconnected" }
  | { type: "reconnecting" }
  | { type: "reconnected" };

/** Base delay for exponential backoff (ms). */
const RECONNECT_BASE_MS = 1_000;
/** Max delay between reconnect attempts (ms). */
const RECONNECT_MAX_MS = 30_000;
/** Retry a fresh terminal attach while its cross-replica routing record propagates. */
const ATTACH_RETRY_BASE_MS = 250;
const ATTACH_RETRY_MAX_MS = 2_000;
const ATTACH_RETRY_LIMIT = 5;
const MAX_REPLAY_HISTORY_LENGTH = 1_000_000;

/**
 * WebSocket client for a single terminal session.
 * Connects to the server's /terminal endpoint and relays I/O.
 * Automatically reconnects on unexpected disconnects until explicitly closed
 * or the server reports a fatal auth/terminal error.
 */
class TerminalSocketConnection {
  private ws: WebSocket | null = null;
  private listeners = new Set<(event: TerminalSocketEvent) => void>();
  private outputHistory: string[] = [];
  private outputHistoryLength = 0;
  private lastLifecycleEvent: TerminalSocketEvent | null = null;
  private closed = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private awaitingReconnectReady = false;
  private attachRetryAttempts = 0;
  private attachRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingWrites: string[] = [];
  private pendingResize: { cols: number; rows: number } | null = null;

  constructor(private terminalId: string) {}

  connect(): void {
    this.closed = false;
    this.awaitingReconnectReady = false;
    this.openSocket();
  }

  private openSocket(): void {
    this.ws = new WebSocket(`${wsBase}/terminal`);

    this.ws.onopen = () => {
      this.awaitingReconnectReady = this.reconnectAttempts > 0;
      this.sendAttach();
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as TerminalSocketEvent;

        // Fatal errors — don't reconnect when the terminal is gone or auth fails.
        // NOTE: these strings must match the server error messages in terminal-handler.ts
        // "Terminal not found" can be transient while a new cross-replica routing record
        // propagates or while the bridge restores its terminal state.
        if (msg.type === "error" && msg.message === "Terminal not found") {
          if (this.scheduleAttachRetry()) return;
          this.closed = true;
        } else if (msg.type === "error" && FATAL_TERMINAL_ERRORS.has(msg.message)) {
          this.closed = true;
        }

        if (msg.type === "ready") {
          const isReconnect = this.awaitingReconnectReady || this.attachRetryAttempts > 0;
          this.awaitingReconnectReady = false;
          this.reconnectAttempts = 0;
          this.clearAttachRetry();
          this.flushPendingResize();
          this.emit(msg);
          this.flushPendingWrites();
          if (isReconnect) {
            this.emit({ type: "reconnected" });
          }
          return;
        }

        this.emit(msg);
      } catch {
        // Ignore parse errors
      }
    };

    this.ws.onclose = (event) => {
      this.clearAttachRetry();
      if (FATAL_TERMINAL_CLOSE_CODES.has(event.code) || FATAL_TERMINAL_ERRORS.has(event.reason)) {
        this.closed = true;
      }
      if (this.closed) {
        this.awaitingReconnectReady = false;
        this.emit({ type: "disconnected" });
        return;
      }
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (this.closed) return;

    this.emit({ type: "reconnecting" });

    const delay = Math.min(
      RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempts),
      RECONNECT_MAX_MS,
    );
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.closed) {
        this.openSocket();
      }
    }, delay);
  }

  private sendAttach(): void {
    this.ws?.send(JSON.stringify({ type: "attach", terminalId: this.terminalId }));
  }

  private scheduleAttachRetry(): boolean {
    if (this.closed || this.attachRetryAttempts >= ATTACH_RETRY_LIMIT) return false;
    if (this.attachRetryTimer) return true;

    this.emit({ type: "reconnecting" });
    const delay = Math.min(
      ATTACH_RETRY_BASE_MS * Math.pow(2, this.attachRetryAttempts),
      ATTACH_RETRY_MAX_MS,
    );
    this.attachRetryAttempts++;
    this.attachRetryTimer = setTimeout(() => {
      this.attachRetryTimer = null;
      if (this.ws?.readyState === WebSocket.OPEN && !this.closed) {
        this.sendAttach();
      }
    }, delay);
    return true;
  }

  private clearAttachRetry(): void {
    if (this.attachRetryTimer) {
      clearTimeout(this.attachRetryTimer);
      this.attachRetryTimer = null;
    }
    this.attachRetryAttempts = 0;
  }

  write(data: string): void {
    if (!this.sendMessage({ type: "input", data }) && !this.closed) {
      this.pendingWrites.push(data);
    }
  }

  resize(cols: number, rows: number): void {
    if (!this.sendMessage({ type: "resize", cols, rows }) && !this.closed) {
      this.pendingResize = { cols, rows };
    }
  }

  onEvent(listener: (event: TerminalSocketEvent) => void): () => void {
    this.listeners.add(listener);
    for (const data of this.outputHistory) {
      listener({ type: "output", data });
    }
    if (this.lastLifecycleEvent) listener(this.lastLifecycleEvent);
    return () => {
      this.listeners.delete(listener);
    };
  }

  close(): void {
    this.closed = true;
    this.awaitingReconnectReady = false;
    this.pendingWrites = [];
    this.pendingResize = null;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.clearAttachRetry();
    this.listeners.clear();
    this.ws?.close();
    this.ws = null;
  }

  private emit(event: TerminalSocketEvent): void {
    if (event.type === "output") {
      this.outputHistory.push(event.data);
      this.outputHistoryLength += event.data.length;
      while (
        this.outputHistoryLength > MAX_REPLAY_HISTORY_LENGTH &&
        this.outputHistory.length > 1
      ) {
        this.outputHistoryLength -= this.outputHistory.shift()?.length ?? 0;
      }
    } else if (event.type === "exit" || event.type === "error" || event.type === "disconnected") {
      this.lastLifecycleEvent = event;
    } else if (event.type === "ready" || event.type === "reconnected") {
      this.lastLifecycleEvent = null;
    }

    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private sendMessage(message: Record<string, unknown>): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(message));
    return true;
  }

  private flushPendingResize(): void {
    const resize = this.pendingResize;
    if (!resize) return;
    if (this.sendMessage({ type: "resize", cols: resize.cols, rows: resize.rows })) {
      this.pendingResize = null;
    }
  }

  private flushPendingWrites(): void {
    while (this.pendingWrites.length > 0) {
      const data = this.pendingWrites[0]!;
      if (!this.sendMessage({ type: "input", data })) return;
      this.pendingWrites.shift();
    }
  }
}

interface SharedTerminalConnection {
  connection: TerminalSocketConnection;
  connected: boolean;
  references: number;
}

const sharedConnections = new Map<string, SharedTerminalConnection>();

/**
 * Reference-counted terminal transport. Multiple terminal views for the same
 * terminal ID share one WebSocket and receive the same output stream.
 */
export class TerminalSocket {
  private readonly shared: SharedTerminalConnection;
  private readonly listenerCleanups = new Set<() => void>();
  private released = false;

  constructor(private readonly terminalId: string) {
    const existing = sharedConnections.get(terminalId);
    this.shared = existing ?? {
      connection: new TerminalSocketConnection(terminalId),
      connected: false,
      references: 0,
    };
    this.shared.references += 1;
    sharedConnections.set(terminalId, this.shared);
  }

  connect(): void {
    if (this.released || this.shared.connected) return;
    this.shared.connected = true;
    this.shared.connection.connect();
  }

  write(data: string): void {
    if (!this.released) this.shared.connection.write(data);
  }

  resize(cols: number, rows: number): void {
    if (!this.released) this.shared.connection.resize(cols, rows);
  }

  onEvent(listener: (event: TerminalSocketEvent) => void): () => void {
    if (this.released) return () => undefined;

    const unsubscribeConnection = this.shared.connection.onEvent(listener);
    const cleanup = () => {
      unsubscribeConnection();
      this.listenerCleanups.delete(cleanup);
    };
    this.listenerCleanups.add(cleanup);
    return cleanup;
  }

  close(): void {
    if (this.released) return;
    this.released = true;
    for (const cleanup of [...this.listenerCleanups]) cleanup();

    this.shared.references -= 1;
    if (this.shared.references > 0) return;

    this.shared.connection.close();
    sharedConnections.delete(this.terminalId);
  }
}
