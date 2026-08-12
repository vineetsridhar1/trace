import { act, create } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTerminalStore } from "../../stores/terminal";
import { useUIStore } from "../../stores/ui";
import { useTerminalActions } from "./useTerminalActions";

const mutation = vi.fn();

vi.mock("../../lib/urql", () => ({
  client: {
    mutation: (...args: unknown[]) => mutation(...args),
  },
}));

interface TerminalActions {
  handleCreateTerminal: (
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
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
    vi.stubGlobal("history", { pushState: vi.fn(), replaceState: vi.fn() });
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    useTerminalStore.setState({ terminals: {} });
    useUIStore.setState({
      activeSessionGroupId: "group-1",
      activeSessionId: null,
      activeTerminalId: null,
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("registers a newly created terminal before selecting it", async () => {
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

    expect(useTerminalStore.getState().terminals["terminal-1"]).toMatchObject({
      id: "terminal-1",
      sessionId: "session-1",
      sessionGroupId: "group-1",
      status: "connecting",
    });
    expect(useUIStore.getState().activeSessionId).toBe("session-1");
    expect(useUIStore.getState().activeTerminalId).toBe("terminal-1");
  });
});
