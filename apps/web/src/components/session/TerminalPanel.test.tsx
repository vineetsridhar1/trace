import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTerminalStore } from "../../stores/terminal";
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
    useTerminalStore.getState().addTerminal("terminal-1", "session-1", "group-1", "active");
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

  it("mounts one terminal without an inner tab strip", async () => {
    const renderer = await renderPanel();

    expect(renderer.root.findAllByProps({ "data-terminal-instance": "terminal-1" })).toHaveLength(
      1,
    );
    expect(
      renderer.root
        .findAllByType("button")
        .filter((button) => button.props["aria-pressed"] !== undefined),
    ).toHaveLength(0);
  });

  it("ignores legacy pin state and keeps rendering the terminal", async () => {
    useTerminalStore.getState().pinTerminal("terminal-1");
    const renderer = await renderPanel();
    expect(renderer.root.findAllByProps({ "data-terminal-instance": "terminal-1" })).toHaveLength(
      1,
    );
  });

  it("renders only one terminal when the session has multiple terminals", async () => {
    useTerminalStore.getState().addTerminal("terminal-2", "session-1", "group-1", "active");

    const renderer = await renderPanel();

    expect(renderer.root.findAllByProps({ "data-terminal-instance": "terminal-1" })).toHaveLength(
      1,
    );
    expect(renderer.root.findAllByProps({ "data-terminal-instance": "terminal-2" })).toHaveLength(
      0,
    );
  });
});
