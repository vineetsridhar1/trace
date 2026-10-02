import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionListName } from "./SessionListName";
import { renameSessionGroup } from "../../lib/rename-session-group";

vi.mock("@trace/client-core", () => ({ useEntityField: () => "Original name" }));
vi.mock("../../lib/rename-session-group", () => ({ renameSessionGroup: vi.fn() }));
let renderer: ReactTestRenderer;
const onOpen = vi.fn();
const event = { stopPropagation: vi.fn(), preventDefault: vi.fn(), detail: 1 };

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  act(() => {
    renderer = create(<SessionListName groupId="group" onOpen={onOpen} />);
  });
});
afterEach(() => {
  act(() => renderer.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function doubleClick() {
  const title = renderer.root.findByType("span");
  act(() => {
    title.props.onClick(event);
    title.props.onClick({ ...event, detail: 2 });
    title.props.onDoubleClick(event);
    vi.runAllTimers();
  });
}

describe("session list renaming", () => {
  it("opens on single click but cancels navigation on double click", () => {
    act(() => {
      renderer.root.findByType("span").props.onClick(event);
      vi.runAllTimers();
    });
    expect(onOpen).toHaveBeenCalledTimes(1);
    onOpen.mockClear();
    doubleClick();
    expect(onOpen).not.toHaveBeenCalled();
    expect(renderer.root.findByType("input").props.value).toBe("Original name");
  });

  it("trims and saves once on Enter, even if blur follows", () => {
    doubleClick();
    act(() =>
      renderer.root.findByType("input").props.onChange({ target: { value: "  New name  " } }),
    );
    const input = renderer.root.findByType("input");
    act(() => {
      input.props.onKeyDown({ ...event, key: "Enter" });
      input.props.onBlur();
    });
    expect(renameSessionGroup).toHaveBeenCalledExactlyOnceWith("group", "New name");
  });

  it.each(["Escape", "Enter"])("does not rename on %s with an empty draft", (key) => {
    doubleClick();
    act(() => renderer.root.findByType("input").props.onChange({ target: { value: "  " } }));
    act(() => renderer.root.findByType("input").props.onKeyDown({ ...event, key }));
    expect(renameSessionGroup).not.toHaveBeenCalled();
  });

  it("saves on blur and cancels an edited value on Escape", () => {
    doubleClick();
    act(() =>
      renderer.root.findByType("input").props.onChange({ target: { value: "Discard me" } }),
    );
    act(() => renderer.root.findByType("input").props.onKeyDown({ ...event, key: "Escape" }));
    expect(renameSessionGroup).not.toHaveBeenCalled();
    doubleClick();
    act(() => renderer.root.findByType("input").props.onChange({ target: { value: "Keep me" } }));
    act(() => renderer.root.findByType("input").props.onBlur());
    expect(renameSessionGroup).toHaveBeenCalledExactlyOnceWith("group", "Keep me");
  });
});
