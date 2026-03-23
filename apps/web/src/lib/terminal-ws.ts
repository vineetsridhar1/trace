const API_URL = import.meta.env.VITE_API_URL ?? "";
const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
const wsBase = API_URL
  ? API_URL.replace(/^https?:/, wsProtocol)
  : `${wsProtocol}//${window.location.host}`;

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
/** Max reconnect attempts before giving up. */
const MAX_RECONNECT_ATTEMPTS = 10;

/**
 * WebSocket client for a single terminal session.
 * Connects to the server's /terminal endpoint and relays I/O.
 * Automatically reconnects on unexpected disconnects.
 */
export class TerminalSocket {
  private ws: WebSocket | null = null;
  private listeners = new Set<(event: TerminalSocketEvent) => void>();
  private closed = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private terminalId: string) {}

  connect(): void {
    this.closed = false;
    this.openSocket();
  }

  private openSocket(): void {
    const token = getToken();
    const url = token
      ? `${wsBase}/terminal?token=${encodeURIComponent(token)}`
      : `${wsBase}/terminal`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      const isReconnect = this.reconnectAttempts > 0;
      this.reconnectAttempts = 0;
      this.ws?.send(JSON.stringify({ type: "attach", terminalId: this.terminalId }));
      // Emit reconnected eagerly — the attach may still fail, but the server
      // replays scrollback on attach so the UI recovers quickly either way.
      if (isReconnect) {
        this.emit({ type: "reconnected" });
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as TerminalSocketEvent;

        // Fatal errors — don't reconnect when the terminal is gone or auth fails.
        // NOTE: these strings must match the server error messages in terminal-handler.ts
        if (msg.type === "error" && (msg.message === "Terminal not found" || msg.message === "Access denied")) {
          this.closed = true;
        }

        for (const listener of this.listeners) {
          listener(msg);
        }
      } catch {
        // Ignore parse errors
      }
    };

    this.ws.onclose = () => {
      if (this.closed) {
        this.emit({ type: "disconnected" });
        return;
      }
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (this.closed) return;
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.closed = true;
      this.emit({ type: "disconnected" });
      return;
    }

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
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "input", data }));
    }
  }

  resize(cols: number, rows: number): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "resize", cols, rows }));
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
}
