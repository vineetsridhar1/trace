import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class MockWebSocket {
  static readonly OPEN = 1;
  static instances: MockWebSocket[] = [];

  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;

  constructor(readonly url: string) {
    MockWebSocket.instances.push(this);
  }

  open(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  send(data: string): void {
    this.sent.push(data);
  }

  receive(message: unknown): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  close(): void {
    this.readyState = 3;
  }
}

describe("TerminalSocket", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    MockWebSocket.instances = [];
    vi.stubGlobal("window", {
      location: { protocol: "https:", host: "trace.test" },
    });
    vi.stubGlobal("WebSocket", MockWebSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("retries a new terminal attach while the bridge makes it available", async () => {
    const { TerminalSocket } = await import("./terminal-ws");
    const socket = new TerminalSocket("terminal-1");
    const events: Array<{ type: string }> = [];
    socket.onEvent((event) => events.push(event));

    socket.connect();
    const ws = MockWebSocket.instances[0]!;
    ws.open();
    expect(ws.sent).toEqual([JSON.stringify({ type: "attach", terminalId: "terminal-1" })]);

    ws.receive({ type: "error", message: "Terminal not found" });
    expect(events).toEqual([{ type: "reconnecting" }]);

    await vi.advanceTimersByTimeAsync(250);
    expect(ws.sent).toHaveLength(2);

    ws.receive({ type: "ready" });
    expect(events).toEqual([{ type: "reconnecting" }, { type: "ready" }, { type: "reconnected" }]);
  });
});
