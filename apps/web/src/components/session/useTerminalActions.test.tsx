import { act, create } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTerminalStore } from "../../stores/terminal";
import { reconcileTerminalEvent } from "../../stores/terminal-events";
import { useUIStore } from "../../stores/ui";
import { useTerminalActions } from "./useTerminalActions";
import type { Event } from "@trace/gql";

const mutation = vi.fn();
const query = vi.fn();

vi.mock("../../lib/urql", () => ({
  client: {
    mutation: (...args: unknown[]) => mutation(...args),
    query: (...args: unknown[]) => query(...args),
  },
}));

interface TerminalActions {
  handleCreateTerminal: (
    session: { id: string; _optimistic?: boolean } | null,
    terminalAllowed: boolean,
  ) => Promise<void>;
  handleOpenTerminal: (
    session: { id: string; _optimistic?: boolean } | null,
    terminalAllowed: boolean,
  ) => Promise<void>;
}

function Harness({ onReady }: { onReady: (actions: TerminalActions) => void }) {
  const actions = useTerminalActions({ sessionGroupId: "group-1", terminals: [] });
  onReady(actions);
  return null;
}

describe("useTerminalActions", () => {
  beforeEach(() => {
    mutation.mockReset();
    query.mockReset();
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
    vi.stubGlobal("history", { pushState: vi.fn(), replaceState: vi.fn() });
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    useTerminalStore.setState({
      terminals: {},
      pinnedTerminalIds: {},
      terminalCreationIntents: {},
      closedTerminalIds: {},
      restoredScopeKeys: {},
    });
    useUIStore.setState({
      activeSessionGroupId: "group-1",
      activeSessionId: null,
      activeTerminalId: null,
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("registers and selects a terminal without pinning it", async () => {
    mutation.mockReturnValue({
      toPromise: async () => ({ data: { createTerminal: { id: "terminal-1" } } }),
    });
    let actions: TerminalActions | undefined;

    await act(async () => {
      create(<Harness onReady={(value) => (actions = value)} />);
    });
    await act(async () => {
      await actions?.handleCreateTerminal({ id: "session-1" }, true);
    });

    expect(useTerminalStore.getState().terminals).toEqual({});
    expect(useUIStore.getState().activeTerminalId).toBeNull();
    const mutationVariables = mutation.mock.calls[0]?.[1] as
      | { clientMutationId?: string }
      | undefined;
    expect(mutationVariables?.clientMutationId).toEqual(expect.any(String));

    act(() => {
      reconcileTerminalEvent({
        id: "event-terminal-created",
        eventType: "terminal_created",
        scopeType: "session",
        scopeId: "session-1",
        timestamp: "2026-08-17T00:00:00.000Z",
        payload: {
          clientMutationId: mutationVariables?.clientMutationId,
          terminal: {
            id: "terminal-1",
            sessionId: "session-1",
            sessionGroupId: "group-1",
            closed: false,
          },
        },
      } as unknown as Event);
    });

    expect(useTerminalStore.getState().terminals["terminal-1"]).toMatchObject({
      id: "terminal-1",
      sessionId: "session-1",
      sessionGroupId: "group-1",
      status: "active",
    });
    expect(useUIStore.getState().activeSessionId).toBe("session-1");
    expect(useUIStore.getState().activeTerminalId).toBe("terminal-1");
    expect(useTerminalStore.getState().pinnedTerminalIds["terminal-1"]).toBeUndefined();
  });
  it("creates a new terminal instead of restoring one the user closed", async () => {
    query.mockReturnValue({
      toPromise: async () => ({
        data: { sessionTerminals: [{ id: "terminal-1", sessionId: "session-1" }] },
      }),
    });
    mutation.mockReturnValue({
      toPromise: async () => ({ data: { createTerminal: { id: "terminal-2" } } }),
    });
    let actions: TerminalActions | undefined;
    act(() => {
      create(<Harness onReady={(value) => (actions = value)} />);
    });

    // First open restores the terminal that already exists on the server.
    await act(async () => {
      await actions!.handleOpenTerminal({ id: "session-1" }, true);
    });
    expect(query).toHaveBeenCalledTimes(1);
    expect(mutation).not.toHaveBeenCalled();
    expect(useUIStore.getState().activeTerminalId).toBe("terminal-1");

    act(() => {
      useTerminalStore.getState().removeTerminal("terminal-1");
    });

    // The store is empty again, but that means "closed", not "never loaded" —
    // opening a terminal must not re-query and hand back the closed one.
    await act(async () => {
      await actions!.handleOpenTerminal({ id: "session-1" }, true);
    });
    expect(query).toHaveBeenCalledTimes(1);
    expect(mutation).toHaveBeenCalled();
  });

  it("shares an in-flight terminal restore across concurrent opens", async () => {
    let resolveQuery:
      | ((value: { data: { sessionTerminals: Array<{ id: string; sessionId: string }> } }) => void)
      | undefined;
    query.mockReturnValue({
      toPromise: () =>
        new Promise<{ data: { sessionTerminals: Array<{ id: string; sessionId: string }> } }>(
          (resolve) => {
            resolveQuery = resolve;
          },
        ),
    });
    let actions: TerminalActions | undefined;
    act(() => {
      create(<Harness onReady={(value) => (actions = value)} />);
    });

    const first = actions!.handleOpenTerminal({ id: "session-1" }, true);
    const second = actions!.handleOpenTerminal({ id: "session-1" }, true);
    expect(query).toHaveBeenCalledTimes(1);

    resolveQuery?.({
      data: { sessionTerminals: [{ id: "terminal-1", sessionId: "session-1" }] },
    });
    await act(async () => {
      await Promise.all([first, second]);
    });

    expect(mutation).not.toHaveBeenCalled();
    expect(useUIStore.getState().activeTerminalId).toBe("terminal-1");
  });
});
