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

  it("retries a new terminal attach when its routing record has not propagated", async () => {
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
    socket.close();
  });

  it("shares one connection and output stream across replicated views", async () => {
    const { TerminalSocket } = await import("./terminal-ws");
    const sidebarSocket = new TerminalSocket("terminal-1");
    const mainSocket = new TerminalSocket("terminal-1");
    const sidebarOutput: string[] = [];
    const mainOutput: string[] = [];

    sidebarSocket.onEvent((event) => {
      if (event.type === "output") sidebarOutput.push(event.data);
    });
    mainSocket.onEvent((event) => {
      if (event.type === "output") mainOutput.push(event.data);
    });

    sidebarSocket.connect();
    mainSocket.connect();
    expect(MockWebSocket.instances).toHaveLength(1);

    const ws = MockWebSocket.instances[0]!;
    ws.open();
    ws.receive({ type: "ready" });
    ws.receive({ type: "output", data: "hello" });

    expect(sidebarOutput).toEqual(["hello"]);
    expect(mainOutput).toEqual(["hello"]);

    sidebarSocket.close();
    mainSocket.write(" world");
    expect(ws.sent.at(-1)).toBe(JSON.stringify({ type: "input", data: " world" }));

    mainSocket.close();
    expect(ws.readyState).toBe(3);
  });

  it("replays existing output when a replicated view attaches", async () => {
    const { TerminalSocket } = await import("./terminal-ws");
    const sidebarSocket = new TerminalSocket("terminal-1");
    sidebarSocket.connect();

    const ws = MockWebSocket.instances[0]!;
    ws.open();
    ws.receive({ type: "ready" });
    ws.receive({ type: "output", data: "existing output" });

    const replicaOutput: string[] = [];
    const mainSocket = new TerminalSocket("terminal-1");
    mainSocket.onEvent((event) => {
      if (event.type === "output") replicaOutput.push(event.data);
    });
    mainSocket.connect();

    expect(replicaOutput).toEqual(["existing output"]);
    expect(MockWebSocket.instances).toHaveLength(1);

    mainSocket.close();
    sidebarSocket.close();
  });
});
