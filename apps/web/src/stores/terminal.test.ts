import { beforeEach, describe, expect, it } from "vitest";
import { useTerminalStore } from "./terminal";

describe("terminal pinning", () => {
  beforeEach(() => {
    useTerminalStore.setState({
      terminals: {},
      pinnedTerminalIds: {},
      terminalCreationIntents: {},
      closedTerminalIds: {},
      restoredScopeKeys: {},
    });
  });

  it("pins and unpins an existing terminal", () => {
    const store = useTerminalStore.getState();
    store.addTerminal("terminal-1", "session-1", "group-1", "active");

    useTerminalStore.getState().pinTerminal("terminal-1");
    expect(useTerminalStore.getState().pinnedTerminalIds).toEqual({ "terminal-1": true });

    useTerminalStore.getState().unpinTerminal("terminal-1");
    expect(useTerminalStore.getState().pinnedTerminalIds).toEqual({});
  });

  it("removes a terminal from the pinned list when it is destroyed", () => {
    const store = useTerminalStore.getState();
    store.addTerminal("terminal-1", "session-1", "group-1", "active");
    useTerminalStore.getState().pinTerminal("terminal-1");

    useTerminalStore.getState().removeTerminal("terminal-1");

    expect(useTerminalStore.getState().terminals).toEqual({});
    expect(useTerminalStore.getState().pinnedTerminalIds).toEqual({});
  });

  it("does not let a stale terminal list re-add a terminal closed in this tab", () => {
    const store = useTerminalStore.getState();
    store.addTerminal("terminal-1", "session-1", "group-1", "active");
    useTerminalStore.getState().removeTerminal("terminal-1");

    useTerminalStore.getState().addTerminal("terminal-1", "session-1", "group-1", "active");

    expect(useTerminalStore.getState().terminals).toEqual({});
  });

  it("consumes only the creation intent with the matching request and session", () => {
    const store = useTerminalStore.getState();
    store.registerTerminalCreationIntent("request-1", {
      sessionId: "session-1",
      pin: true,
      createdAt: Date.now(),
    });

    expect(
      useTerminalStore.getState().consumeTerminalCreationIntent("request-1", "session-2"),
    ).toBeNull();
    expect(
      useTerminalStore.getState().consumeTerminalCreationIntent("request-1", "session-1"),
    ).toMatchObject({ pin: true });
    expect(useTerminalStore.getState().terminalCreationIntents).toEqual({});
  });

  it("claims an initial command only once and releases it with the terminal", () => {
    const store = useTerminalStore.getState();
    store.addTerminal("terminal-1", "session-1", "group-1", "active", {
      initialCommand: "pnpm test",
    });

    expect(store.claimInitialCommand("terminal-1")).toEqual({
      command: "pnpm test",
      submitInitialCommand: true,
    });
    expect(store.claimInitialCommand("terminal-1")).toBeNull();
    store.removeTerminal("terminal-1");
    expect(useTerminalStore.getState().terminals).toEqual({});
  });
});
