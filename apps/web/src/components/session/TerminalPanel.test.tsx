import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTerminalStore } from "../../stores/terminal";
import { useUIStore } from "../../stores/ui";
import { TerminalPanel } from "./TerminalPanel";

const query = vi.fn();

vi.mock("@trace/client-core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@trace/client-core")>()),
  useEntityField: () => "group-1",
}));

vi.mock("../../lib/urql", () => ({
  client: {
    query: (...args: unknown[]) => query(...args),
    mutation: vi.fn(),
  },
}));

vi.mock("./TerminalInstance", () => ({
  TerminalInstance: ({ terminalId }: { terminalId: string }) => (
    <div data-terminal-instance={terminalId} />
  ),
}));

vi.mock("./PinnedTerminalNotice", () => ({
  PinnedTerminalNotice: () => <div data-pinned-terminal-notice />,
}));

describe("TerminalPanel", () => {
  let activeRenderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    query.mockReturnValue({
      toPromise: async () => ({
        data: { sessionTerminals: [{ id: "terminal-1", sessionId: "session-1" }] },
      }),
    });
    useTerminalStore.setState({
      terminals: {},
      pinnedTerminalIds: {},
      pendingPinnedTerminalSessions: {},
    });
    useTerminalStore
      .getState()
      .addTerminal("terminal-1", "session-1", "group-1", "active");
    useUIStore.setState({ activeSessionId: "session-1", activeTerminalId: null });
  });

  afterEach(() => {
    act(() => activeRenderer?.unmount());
    activeRenderer = undefined;
    vi.unstubAllGlobals();
  });

  async function renderPanel(): Promise<ReactTestRenderer> {
    let renderer: ReactTestRenderer | undefined;
    await act(async () => {
      renderer = create(<TerminalPanel sessionId="session-1" onClose={() => undefined} fill />);
    });
    if (!renderer) throw new Error("Terminal panel did not render");
    activeRenderer = renderer;
    return renderer;
  }

  it("mounts the terminal in the sidebar while it is not pinned", async () => {
    const renderer = await renderPanel();

    expect(renderer.root.findAllByProps({ "data-terminal-instance": "terminal-1" })).toHaveLength(1);
    expect(renderer.root.findAllByProps({ "data-pinned-terminal-notice": true })).toHaveLength(0);
  });

  it("replaces the sidebar instance with a deep-link notice while pinned", async () => {
    useTerminalStore.getState().pinTerminal("terminal-1");

    const renderer = await renderPanel();

    expect(renderer.root.findAllByProps({ "data-terminal-instance": "terminal-1" })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ "data-pinned-terminal-notice": true })).toHaveLength(1);
  });
});
