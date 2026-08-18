import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceRequestStore } from "../../stores/workspace-requests";
import { useWorkspaceTabRequests } from "./useWorkspaceTabRequests";

type Hook = ReturnType<typeof useWorkspaceTabRequests>;

let latest: Hook | null = null;

function Harness() {
  latest = useWorkspaceTabRequests({
    sessionGroupId: "group-1",
    setActiveSessionId: () => undefined,
    setActiveTerminalId: () => undefined,
  });
  return null;
}

describe("useWorkspaceTabRequests", () => {
  let renderer: ReactTestRenderer | null = null;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("localStorage", { getItem: vi.fn(() => null), setItem: vi.fn() });
    useWorkspaceRequestStore.setState({
      browserRequestsByGroup: {},
      terminalRequestsByGroup: {},
    });
    latest = null;
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = null;
    vi.unstubAllGlobals();
  });

  it("drops a tab replacement once the workspace reports it applied", async () => {
    await act(async () => {
      renderer = create(<Harness />);
    });

    await act(async () => {
      useWorkspaceRequestStore.getState().enqueueTerminalRequest({
        id: "request-1",
        sessionGroupId: "group-1",
        sessionId: "session-1",
        terminalId: "term-1",
        replaceTabId: "draft:blank",
        select: true,
      });
    });
    expect(latest?.tabReplacements).toEqual({ "draft:blank": "terminal:term-1" });

    // A replacement is a one-shot instruction. Keeping it would grow the map for
    // the life of the session and replay every past replacement on each sync.
    await act(async () => {
      latest?.handleTabReplacementsApplied(["draft:blank"]);
    });
    expect(latest?.tabReplacements).toEqual({});
  });

  it("keeps replacements the workspace has not applied yet", async () => {
    await act(async () => {
      renderer = create(<Harness />);
    });

    await act(async () => {
      useWorkspaceRequestStore.getState().enqueueTerminalRequest({
        id: "request-1",
        sessionGroupId: "group-1",
        sessionId: "session-1",
        terminalId: "term-1",
        replaceTabId: "draft:blank",
        select: false,
      });
    });

    await act(async () => {
      latest?.handleTabReplacementsApplied(["draft:other"]);
    });
    expect(latest?.tabReplacements).toEqual({ "draft:blank": "terminal:term-1" });
  });
});
