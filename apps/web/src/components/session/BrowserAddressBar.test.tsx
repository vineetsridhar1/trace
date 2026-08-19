import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserAddressBar } from "./BrowserAddressBar";

describe("BrowserAddressBar", () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    vi.unstubAllGlobals();
  });

  function renderAddressBar(
    overrides: Partial<React.ComponentProps<typeof BrowserAddressBar>> = {},
  ) {
    let nextRenderer: ReactTestRenderer | undefined;
    act(() => {
      nextRenderer = create(
        <BrowserAddressBar
          addressHistory={["https://example.com/path"]}
          canGoBack={false}
          canGoForward={false}
          inputValue="https://current.example"
          loading={false}
          syncStatusColor="bg-emerald-500"
          syncStatusLabel="Synced"
          onAddressBlur={() => undefined}
          onAddressFocus={() => undefined}
          onGoBack={() => undefined}
          onGoForward={() => undefined}
          onInputChange={() => undefined}
          onNavigate={() => undefined}
          onReload={() => undefined}
          {...overrides}
        />,
      );
    });
    if (!nextRenderer) throw new Error("Browser address bar did not render");
    renderer = nextRenderer;
    return nextRenderer;
  }

  it("selects the full address when focused or clicked", () => {
    const onAddressFocus = vi.fn();
    const select = vi.fn();
    const addressBar = renderAddressBar({ onAddressFocus });
    const input = addressBar.root.findByProps({ "aria-label": "Browser URL" });

    act(() => input.props.onFocus({ currentTarget: { select } }));
    act(() => input.props.onClick({ currentTarget: { select } }));

    expect(onAddressFocus).toHaveBeenCalledOnce();
    expect(select).toHaveBeenCalledTimes(2);
  });

  it("renders persisted addresses as suggestions", () => {
    const addressBar = renderAddressBar({
      addressHistory: ["https://example.com/path", "https://trace.example"],
    });

    expect(addressBar.root.findAllByType("option").map((option) => option.props.value)).toEqual([
      "https://example.com/path",
      "https://trace.example",
    ]);
  });
});
