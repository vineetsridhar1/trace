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

function getToken(): string | null {
  return localStorage.getItem("trace_token");
}

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

/**
 * WebSocket client for a single terminal session.
 * Connects to the server's /terminal endpoint and relays I/O.
 * Automatically reconnects on unexpected disconnects until explicitly closed
 * or the server reports a fatal auth/terminal error.
 */
export class TerminalSocket {
  private ws: WebSocket | null = null;
  private listeners = new Set<(event: TerminalSocketEvent) => void>();
  private closed = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private awaitingReconnectReady = false;
  private pendingWrites: string[] = [];
  private pendingResize: { cols: number; rows: number } | null = null;

  constructor(private terminalId: string) {}

  connect(): void {
    this.closed = false;
    this.awaitingReconnectReady = false;
    this.openSocket();
  }

  private openSocket(): void {
    const token = getToken();
    const url = token
      ? `${wsBase}/terminal?token=${encodeURIComponent(token)}`
      : `${wsBase}/terminal`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.awaitingReconnectReady = this.reconnectAttempts > 0;
      this.ws?.send(JSON.stringify({ type: "attach", terminalId: this.terminalId }));
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as TerminalSocketEvent;

        // Fatal errors — don't reconnect when the terminal is gone or auth fails.
        // NOTE: these strings must match the server error messages in terminal-handler.ts
        // Exception: "Terminal not found" is transient during reconnect — the bridge
        // may still be restoring its terminal state. Only treat it as fatal on first connect.
        if (msg.type === "error" && FATAL_TERMINAL_ERRORS.has(msg.message)) {
          if (!(msg.message === "Terminal not found" && this.awaitingReconnectReady)) {
            this.closed = true;
          }
        }

        if (msg.type === "ready") {
          const isReconnect = this.awaitingReconnectReady;
          this.awaitingReconnectReady = false;
          this.reconnectAttempts = 0;
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
      if (
        FATAL_TERMINAL_CLOSE_CODES.has(event.code)
        || FATAL_TERMINAL_ERRORS.has(event.reason)
      ) {
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
    this.listeners.clear();
    this.ws?.close();
    this.ws = null;
  }

  private emit(event: TerminalSocketEvent): void {
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
