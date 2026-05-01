import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRuntime: vi.fn(),
  send: vi.fn(() => "delivered"),
  sendToRuntime: vi.fn(() => "delivered"),
  sessionFindMany: vi.fn(),
  channelFindMany: vi.fn(),
}));

vi.mock("./session-router.js", () => ({
  sessionRouter: {
    getRuntime: mocks.getRuntime,
    send: mocks.send,
    sendToRuntime: mocks.sendToRuntime,
  },
}));

vi.mock("./db.js", () => ({
  prisma: {
    session: { findMany: mocks.sessionFindMany },
    channel: { findMany: mocks.channelFindMany },
  },
}));

import { TerminalRelay } from "./terminal-relay.js";

function createOpenWs() {
  return {
    OPEN: 1,
    readyState: 1,
    send: vi.fn(),
  };
}

describe("TerminalRelay runtime identity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRuntime.mockImplementation((runtimeId: string, organizationId?: string | null) => {
      if (
        runtimeId === "bridge-1" ||
        runtimeId === "org-1:bridge-1" ||
        (runtimeId === "bridge-1" && organizationId === "org-1")
      ) {
        return {
          id: "bridge-1",
          key: "org-1:bridge-1",
          organizationId: "org-1",
          ws: { OPEN: 1, readyState: 1 },
        };
      }
      return undefined;
    });
    mocks.sessionFindMany.mockResolvedValue([]);
    mocks.channelFindMany.mockResolvedValue([]);
  });

  it("accepts bridge terminal messages from the org-scoped runtime key", () => {
    const relay = new TerminalRelay();
    const ws = createOpenWs();

    const terminalId = relay.createTerminal(
      "session-1",
      "group-1",
      "org-1",
      "bridge-1",
      "user-1",
      80,
      24,
      "/repo",
    );
    relay.attachFrontend(terminalId, ws as never, "user-1");

    relay.relayFromBridge({ type: "terminal_ready", terminalId }, "org-1:bridge-1");
    relay.relayFromBridge(
      { type: "terminal_output", terminalId, data: "hello" },
      "org-1:bridge-1",
    );

    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: "ready" }));
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: "output", data: "hello" }));
  });

  it("keeps restored terminal auth IDs external while matching the org-scoped runtime key", async () => {
    const relay = new TerminalRelay();
    const ws = createOpenWs();
    mocks.sessionFindMany.mockResolvedValueOnce([
      { id: "session-1", sessionGroupId: "group-1", organizationId: "org-1" },
    ]);

    await relay.restoreTerminals("org-1:bridge-1", [
      { terminalId: "term-1", sessionId: "session-1" },
    ]);
    relay.attachFrontend("term-1", ws as never, "user-1");
    relay.relayFromBridge({ type: "terminal_ready", terminalId: "term-1" }, "org-1:bridge-1");

    expect(relay.getTerminalAuthContext("term-1")).toMatchObject({
      kind: "session",
      runtimeInstanceId: "bridge-1",
    });
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: "ready" }));
  });
});
