import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SpatialWorkspace } from "./SpatialWorkspace";
import { createSpatialLayout, dockSpatialTab } from "./spatial-workspace-layout";

function NewTabHarness() {
  const [tabs, setTabs] = useState([{ id: "chat", label: "Chat", icon: null }]);
  return (
    <SpatialWorkspace
      persistenceKey="spatial-workspace-new-tab-test"
      tabs={tabs}
      preferredActiveTabId="chat"
      onActivateTab={() => undefined}
      onCloseTab={() => undefined}
      onNewTab={() => {
        setTabs((current) => [...current, { id: "draft:new", label: "New tab", icon: null }]);
        return "draft:new";
      }}
      renderTab={(tabId) => <div data-rendered-tab={tabId} />}
    />
  );
}

describe("SpatialWorkspace", () => {
  let renderer: ReactTestRenderer | null = null;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = null;
    vi.unstubAllGlobals();
  });

  it("mounts the grouped workspace", async () => {
    await act(async () => {
      renderer = create(
        <SpatialWorkspace
          persistenceKey="spatial-workspace-test"
          tabs={[{ id: "chat", label: "Chat", icon: null }]}
          onActivateTab={() => undefined}
          onCloseTab={() => undefined}
          onNewTab={() => "draft:new"}
          renderTab={() => <div>Chat content</div>}
        />,
      );
    });

    if (!renderer) throw new Error("Expected the workspace to mount");
    expect(renderer.toJSON()).not.toBeNull();
  });

  it("keeps a newly created tab active when its tab entry is added", async () => {
    await act(async () => {
      renderer = create(<NewTabHarness />);
    });

    if (!renderer) throw new Error("Expected the workspace to mount");
    await act(async () => {
      renderer?.root.findByProps({ "aria-label": "New tab" }).props.onClick();
    });

    expect(renderer.root.findByProps({ "data-rendered-tab": "draft:new" })).toBeDefined();
  });

  it("restores global resize state when unmounted mid-drag", async () => {
    const layout = dockSpatialTab(
      createSpatialLayout(["first", "second"], "first"),
      "second",
      "right",
      "full",
    );
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => JSON.stringify(layout)),
      setItem: vi.fn(),
    });
    vi.stubGlobal("window", { addEventListener, removeEventListener });
    vi.stubGlobal("document", {
      body: { style: { cursor: "default", userSelect: "text" } },
      documentElement: { scrollLeft: 0, scrollTop: 0 },
    });

    await act(async () => {
      renderer = create(
        <SpatialWorkspace
          persistenceKey="spatial-workspace-resize-cleanup"
          tabs={[
            { id: "first", label: "First", icon: null },
            { id: "second", label: "Second", icon: null },
          ]}
          onActivateTab={() => undefined}
          onCloseTab={() => undefined}
          onNewTab={() => "draft:new"}
          renderTab={(tabId) => <div>{tabId}</div>}
        />,
      );
    });

    if (!renderer) throw new Error("Expected the workspace to mount");
    const separator = renderer.root.findByProps({ role: "separator" });
    await act(async () => {
      separator.props.onPointerDown({
        button: 0,
        currentTarget: {
          parentElement: {
            getBoundingClientRect: () => ({ left: 0, top: 0, width: 1_000, height: 600 }),
          },
        },
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      });
    });
    expect(document.body.style.cursor).toBe("col-resize");

    await act(async () => renderer?.unmount());
    renderer = null;
    expect(removeEventListener).toHaveBeenCalledWith("pointermove", expect.any(Function));
    expect(document.body.style.cursor).toBe("default");
    expect(document.body.style.userSelect).toBe("text");
  });
});
