import { beforeEach, describe, expect, it, vi } from "vitest";

const createWebSocket = vi.fn();

vi.mock("@trace/client-core", () => ({
  getPlatform: () => ({ createWebSocket }),
  useAuthStore: {
    getState: () => ({ token: "mobile-token" }),
  },
}));

vi.mock("@/lib/connection-target", () => ({
  getActiveApiUrl: () => "https://app.gettrace.org",
}));

describe("TerminalSocket", () => {
  beforeEach(() => {
    createWebSocket.mockReset();
    createWebSocket.mockReturnValue({
      close: vi.fn(),
      readyState: 0,
      send: vi.fn(),
    });
  });

  it("uses the configured mobile WebSocket factory", async () => {
    const { TerminalSocket } = await import("./terminal-ws");

    new TerminalSocket("terminal-1").connect();

    expect(createWebSocket).toHaveBeenCalledWith("wss://app.gettrace.org/terminal");
  });
});
