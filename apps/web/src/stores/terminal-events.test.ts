import type { Event, User } from "@trace/gql";
import { useAuthStore } from "@trace/client-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTerminalStore } from "./terminal";
import { reconcileTerminalEvent } from "./terminal-events";
import { useUIStore } from "./ui";
import { useWorkspaceRequestStore } from "./workspace-requests";

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
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
    vi.stubGlobal("history", { pushState: vi.fn(), replaceState: vi.fn() });
    useTerminalStore.setState({
      terminals: {},
      pinnedTerminalIds: {},
      terminalCreationIntents: {},
      closedTerminalIds: {},
      restoredScopeKeys: {},
    });
    useUIStore.setState({
      activeSessionGroupId: null,
      activeSessionId: null,
      activeTerminalId: null,
    });
    useWorkspaceRequestStore.setState({
      browserRequestsByGroup: {},
      terminalRequestsByGroup: {},
    });
    useAuthStore.setState({
      user: { id: "user-1", email: "user@example.com", name: "User" } as User,
    });
  });

  afterEach(() => vi.unstubAllGlobals());

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

  it("pins and selects a created terminal when the client requested it", () => {
    useUIStore.setState({ activeSessionGroupId: "group-1" });
    useTerminalStore.getState().registerTerminalCreationIntent("request-1", {
      sessionId: "session-1",
      pin: true,
      select: true,
      customName: "Test terminal",
      createdAt: Date.now(),
    });

    reconcileTerminalEvent(
      terminalEvent("terminal_created", {
        clientMutationId: "request-1",
        terminal: {
          id: "terminal-1",
          sessionId: "session-1",
          sessionGroupId: "group-1",
          status: "active",
          closed: false,
        },
      }),
    );

    expect(useTerminalStore.getState().pinnedTerminalIds).toEqual({ "terminal-1": true });
    expect(useTerminalStore.getState().terminalCreationIntents).toEqual({});
    expect(useTerminalStore.getState().terminals["terminal-1"]?.customName).toBe("Test terminal");
    expect(useUIStore.getState().activeSessionId).toBe("session-1");
    expect(useUIStore.getState().activeTerminalId).toBe("terminal-1");
  });

  it("does not consume an intent for an unrelated creation event", () => {
    useTerminalStore.getState().registerTerminalCreationIntent("request-1", {
      sessionId: "session-1",
      pin: true,
      createdAt: Date.now(),
    });

    reconcileTerminalEvent(
      terminalEvent("terminal_created", {
        clientMutationId: "request-2",
        terminal: {
          id: "terminal-2",
          sessionId: "session-1",
          sessionGroupId: "group-1",
          closed: false,
        },
      }),
    );

    expect(useTerminalStore.getState().pinnedTerminalIds).toEqual({});
    expect(useTerminalStore.getState().terminalCreationIntents).toHaveProperty("request-1");
  });

  it("queues a terminal opened by the CLI without navigating away", () => {
    useUIStore.setState({
      activeSessionGroupId: "group-2",
      activeSessionId: "session-2",
      activeTerminalId: null,
    });
    reconcileTerminalEvent(
      terminalEvent("terminal_created", {
        openInWorkspace: true,
        targetUserId: "user-1",
        terminal: {
          id: "terminal-1",
          sessionId: "session-1",
          sessionGroupId: "group-1",
          status: "active",
          closed: false,
        },
      }),
    );

    expect(useUIStore.getState().activeSessionId).toBe("session-2");
    expect(useUIStore.getState().activeTerminalId).toBeNull();
    expect(useWorkspaceRequestStore.getState().terminalRequestsByGroup["group-1"]).toEqual([
      {
        id: "event-terminal_created",
        sessionGroupId: "group-1",
        sessionId: "session-1",
        terminalId: "terminal-1",
        select: true,
      },
    ]);
  });

  it("queues an event-driven workspace tab replacement", () => {
    useUIStore.setState({ activeSessionGroupId: "group-1" });
    useTerminalStore.getState().registerTerminalCreationIntent("request-1", {
      sessionId: "session-1",
      select: true,
      replaceWorkspaceTabId: "draft:new",
      createdAt: Date.now(),
    });
    reconcileTerminalEvent(
      terminalEvent("terminal_created", {
        clientMutationId: "request-1",
        terminal: {
          id: "terminal-1",
          sessionId: "session-1",
          sessionGroupId: "group-1",
          status: "active",
          closed: false,
        },
      }),
    );
    expect(useWorkspaceRequestStore.getState().terminalRequestsByGroup["group-1"]).toEqual([
      {
        id: "event-terminal_created",
        sessionGroupId: "group-1",
        sessionId: "session-1",
        terminalId: "terminal-1",
        replaceTabId: "draft:new",
        select: true,
      },
    ]);
  });

  it("ignores malformed lifecycle payloads", () => {
    reconcileTerminalEvent(terminalEvent("terminal_created", { terminal: { id: "terminal-1" } }));

    expect(useTerminalStore.getState().terminals).toEqual({});
  });
});
