import { beforeEach, describe, expect, it } from "vitest";
import { useTerminalStore } from "./terminal";

describe("terminal pinning", () => {
  beforeEach(() => {
    useTerminalStore.setState({ terminals: {}, pinnedTerminalIds: {} });
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
});
