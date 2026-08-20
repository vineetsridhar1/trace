import { act, create } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUIStore } from "../../stores/ui";
import { useSessionTabClose } from "./useSessionTabClose";

const mutation = vi.fn();
const toastError = vi.fn();

vi.mock("../../lib/urql", () => ({
  client: { mutation: (...args: unknown[]) => mutation(...args) },
}));
vi.mock("sonner", () => ({
  toast: { error: (...args: unknown[]) => toastError(...args) },
}));

type TabClose = ReturnType<typeof useSessionTabClose>;

function Harness({ onReady }: { onReady: (actions: TabClose) => void }) {
  onReady(useSessionTabClose("group-1"));
  return null;
}

function render(): TabClose {
  let actions: TabClose | undefined;
  act(() => {
    create(<Harness onReady={(value) => (actions = value)} />);
  });
  return actions!;
}

describe("useSessionTabClose", () => {
  beforeEach(() => {
    mutation.mockReset();
    toastError.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
    vi.stubGlobal("history", { pushState: vi.fn(), replaceState: vi.fn() });
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    useUIStore.setState({
      openSessionTabsByGroup: { "group-1": ["session-1", "session-2"] },
      hiddenSessionTabsByGroup: {},
      activeSessionGroupId: "group-1",
      activeSessionId: "session-1",
      activeChannelId: null,
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  const hidden = () => useUIStore.getState().hiddenSessionTabsByGroup["group-1"] ?? {};

  it("hides the tab before the server answers", async () => {
    let hiddenDuringRequest = false;
    mutation.mockImplementation(() => {
      hiddenDuringRequest = "session-1" in hidden();
      return { toPromise: async () => ({ data: { hideSessionTab: {} } }) };
    });
    const actions = render();

    await act(async () => {
      await actions.closeSession("session-1");
    });

    expect(hiddenDuringRequest).toBe(true);
    expect(hidden()).toHaveProperty("session-1");
    expect(toastError).not.toHaveBeenCalled();
  });

  it("puts the tab back when the close is refused", async () => {
    mutation.mockReturnValue({ toPromise: async () => ({ error: { message: "denied" } }) });
    const actions = render();

    await act(async () => {
      await actions.closeSession("session-1");
    });

    expect(hidden()).not.toHaveProperty("session-1");
    expect(toastError).toHaveBeenCalledWith("Could not close that tab");
  });

  it("reopens a hidden tab and hides it again when the restore is refused", async () => {
    mutation.mockReturnValue({ toPromise: async () => ({ data: { restoreSessionTab: true } }) });
    const actions = render();
    act(() => {
      useUIStore.getState().hideSessionTab("group-1", "session-2", "2026-08-20T10:00:00.000Z");
    });

    await act(async () => {
      await actions.restoreSession("session-2");
    });
    expect(hidden()).not.toHaveProperty("session-2");
    expect(useUIStore.getState().openSessionTabsByGroup["group-1"]).toContain("session-2");

    act(() => {
      useUIStore.getState().hideSessionTab("group-1", "session-2", "2026-08-20T10:00:01.000Z");
    });
    mutation.mockReturnValue({ toPromise: async () => ({ error: { message: "denied" } }) });

    await act(async () => {
      await actions.restoreSession("session-2");
    });
    expect(hidden()).toHaveProperty("session-2");
    expect(toastError).toHaveBeenCalledWith("Could not reopen that tab");
  });
});
