import type { Event } from "@trace/gql";
import { beforeEach, describe, expect, it } from "vitest";
import { useTerminalStore } from "./terminal";
import { reconcileTerminalEvent } from "./terminal-events";
import { useUIStore } from "./ui";

function terminalEvent(eventType: Event["eventType"], payload: Record<string, unknown>): Event {
  return {
    id: `event-${eventType}`,
    eventType,
    scopeType: "session",
    scopeId: "session-1",
    payload,
    timestamp: "2026-08-10T00:00:00.000Z",
  } as unknown as Event;
}

describe("terminal lifecycle event reconciliation", () => {
  beforeEach(() => {
    useTerminalStore.setState({ terminals: {} });
    useUIStore.setState({ activeTerminalId: null });
  });

  it("adds a terminal from metadata-only terminal_created events", () => {
    reconcileTerminalEvent(
      terminalEvent("terminal_created", {
        terminal: {
          id: "terminal-1",
          sessionId: "session-1",
          sessionGroupId: "group-1",
          status: "active",
          cols: 120,
          rows: 30,
          connected: true,
          closed: false,
        },
      }),
    );

    expect(useTerminalStore.getState().terminals["terminal-1"]).toMatchObject({
      sessionId: "session-1",
      sessionGroupId: "group-1",
      status: "active",
    });
  });

  it("removes a destroyed terminal and clears its active selection", () => {
    useTerminalStore.getState().addTerminal("terminal-1", "session-1", "group-1", "active");
    useUIStore.getState().setActiveTerminalId("terminal-1");

    reconcileTerminalEvent(terminalEvent("terminal_destroyed", { terminalId: "terminal-1" }));

    expect(useTerminalStore.getState().terminals["terminal-1"]).toBeUndefined();
    expect(useUIStore.getState().activeTerminalId).toBeNull();
  });

  it("ignores malformed lifecycle payloads", () => {
    reconcileTerminalEvent(terminalEvent("terminal_created", { terminal: { id: "terminal-1" } }));

    expect(useTerminalStore.getState().terminals).toEqual({});
  });
});
