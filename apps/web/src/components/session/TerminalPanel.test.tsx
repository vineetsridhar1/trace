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

describe("TerminalPanel", () => {
  let activeRenderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
    vi.stubGlobal("history", { pushState: vi.fn(), replaceState: vi.fn() });
    query.mockReturnValue({
      toPromise: async () => ({
        data: { sessionTerminals: [{ id: "terminal-1", sessionId: "session-1" }] },
      }),
    });
    useTerminalStore.setState({
      terminals: {},
      pinnedTerminalIds: {},
      terminalCreationIntents: {},
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

  async function renderPanel(onClose = () => undefined): Promise<ReactTestRenderer> {
    let renderer: ReactTestRenderer | undefined;
    await act(async () => {
      renderer = create(<TerminalPanel sessionId="session-1" onClose={onClose} fill />);
    });
    if (!renderer) throw new Error("Terminal panel did not render");
    activeRenderer = renderer;
    return renderer;
  }

  it("mounts the terminal in the sidebar while it is not pinned", async () => {
    const renderer = await renderPanel();

    expect(renderer.root.findAllByProps({ "data-terminal-instance": "terminal-1" })).toHaveLength(1);
    expect(
      renderer.root
        .findAllByType("button")
        .filter((button) => button.props["aria-label"] === "Open terminal in main panel"),
    ).toHaveLength(0);
  });

  it("replaces the sidebar instance with a working deep link while pinned", async () => {
    useTerminalStore.getState().pinTerminal("terminal-1");
    const onClose = vi.fn();

    const renderer = await renderPanel(onClose);

    expect(renderer.root.findAllByProps({ "data-terminal-instance": "terminal-1" })).toHaveLength(0);
    const openButton = renderer.root
      .findAllByType("button")
      .find((button) => button.props["aria-label"] === "Open terminal in main panel");
    if (!openButton) throw new Error("Open terminal button was not rendered");
    act(() => openButton.props.onClick());
    expect(useUIStore.getState().activeTerminalId).toBe("terminal-1");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not mount an unpinned sidebar terminal while another terminal is active in main", async () => {
    useTerminalStore
      .getState()
      .addTerminal("terminal-2", "session-1", "group-1", "active");
    useTerminalStore.getState().pinTerminal("terminal-2");
    useUIStore.setState({ activeTerminalId: "terminal-2" });

    const renderer = await renderPanel();

    expect(renderer.root.findAllByProps({ "data-terminal-instance": "terminal-1" })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ "data-terminal-instance": "terminal-2" })).toHaveLength(0);
    expect(
      renderer.root
        .findAllByType("button")
        .filter((button) => button.props["aria-label"] === "Open terminal in main panel"),
    ).toHaveLength(1);
  });
});
