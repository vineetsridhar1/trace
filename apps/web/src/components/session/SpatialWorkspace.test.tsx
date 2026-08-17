import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SpatialWorkspace } from "./SpatialWorkspace";

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

  it("mounts the grouped layout menu without a Base UI context error", async () => {
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
});
