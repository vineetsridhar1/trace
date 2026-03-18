const API_URL = import.meta.env.VITE_API_URL ?? "";
const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
const wsBase = API_URL
  ? API_URL.replace(/^https?:/, wsProtocol)
  : `${wsProtocol}//${window.location.host}`;

export type TerminalSocketEvent =
  | { type: "ready" }
  | { type: "output"; data: string }
  | { type: "exit"; exitCode: number }
  | { type: "error"; message: string };

/**
 * WebSocket client for a single terminal session.
 * Connects to the server's /terminal endpoint and relays I/O.
 */
export class TerminalSocket {
  private ws: WebSocket | null = null;
  private listeners = new Set<(event: TerminalSocketEvent) => void>();

  constructor(private terminalId: string) {}

  connect(): void {
    this.ws = new WebSocket(`${wsBase}/terminal`);

    this.ws.onopen = () => {
      this.ws?.send(JSON.stringify({ type: "attach", terminalId: this.terminalId }));
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as TerminalSocketEvent;
        for (const listener of this.listeners) {
          listener(msg);
        }
      } catch {
        // Ignore parse errors
      }
    };

    this.ws.onclose = () => {
      this.emit({ type: "exit", exitCode: -1 });
    };
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
