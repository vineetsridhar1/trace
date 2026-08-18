import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Event, User } from "@trace/gql";
import { useAuthStore } from "@trace/client-core";
import { SpatialWorkspace } from "./SpatialWorkspace";
import { createSpatialLayout, dockSpatialTab } from "./spatial-workspace-layout";
import { useWorkspaceTabRequests } from "./useWorkspaceTabRequests";
import {
  reconcileWorkspaceRequestEvent,
  useWorkspaceRequestStore,
} from "../../stores/workspace-requests";

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

function ForegroundTabHarness() {
  const [foregroundTabId, setForegroundTabId] = useState<string | null>(null);
  return (
    <>
      <button type="button" onClick={() => setForegroundTabId("browser")}>
        Foreground browser
      </button>
      <button type="button" onClick={() => setForegroundTabId(null)}>
        Clear foreground request
      </button>
      <SpatialWorkspace
        persistenceKey="spatial-workspace-foreground-test"
        tabs={[
          { id: "chat", label: "Chat", icon: null },
          { id: "browser", label: "Browser", icon: null },
        ]}
        preferredActiveTabId="chat"
        foregroundTabId={foregroundTabId}
        onActivateTab={() => undefined}
        onCloseTab={() => undefined}
        onNewTab={() => "draft:new"}
        renderTab={(tabId) => <div data-rendered-tab={tabId} />}
      />
    </>
  );
}

function BrowserRequestHarness() {
  const { draftTabs, foregroundTabId } = useWorkspaceTabRequests({
    sessionGroupId: "group-1",
    setActiveSessionId: () => undefined,
    setActiveTerminalId: () => undefined,
  });
  const tabs = [
    { id: "chat", label: "Chat", icon: null },
    ...draftTabs.map((tab) => ({ id: tab.id, label: "Browser", icon: null })),
  ];
  return (
    <SpatialWorkspace
      persistenceKey="spatial-workspace-browser-request-test"
      tabs={tabs}
      preferredActiveTabId="chat"
      foregroundTabId={foregroundTabId}
      onActivateTab={() => undefined}
      onCloseTab={() => undefined}
      onNewTab={() => "draft:new"}
      renderTab={(tabId) => <div data-rendered-tab={tabId} />}
    />
  );
}

function browserRequestEvent(): Event {
  return {
    id: "browser-request-1",
    eventType: "workspace_browser_open_requested",
    scopeType: "system",
    scopeId: "group-1",
    timestamp: "2026-08-17T00:00:00.000Z",
    payload: {
      sessionGroupId: "group-1",
      targetUserId: "user-1",
      url: "https://example.com/",
    },
  } as unknown as Event;
}

describe("SpatialWorkspace", () => {
  let renderer: ReactTestRenderer | null = null;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = null;
    vi.useRealTimers();
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

  it("foregrounds a requested workspace tab", async () => {
    await act(async () => {
      renderer = create(<ForegroundTabHarness />);
    });

    if (!renderer) throw new Error("Expected the workspace to mount");
    expect(renderer.root.findByProps({ "data-rendered-tab": "chat" })).toBeDefined();

    await act(async () => {
      renderer?.root.findByProps({ children: "Foreground browser" }).props.onClick();
    });

    expect(renderer.root.findByProps({ "data-rendered-tab": "browser" })).toBeDefined();

    await act(async () => {
      renderer?.root.findByProps({ children: "Clear foreground request" }).props.onClick();
    });

    expect(renderer.root.findByProps({ "data-rendered-tab": "browser" })).toBeDefined();
  });

  it("foregrounds a browser tab created from a workspace request event", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("localStorage", { getItem: vi.fn(() => null), setItem: vi.fn() });
    useAuthStore.setState({
      user: { id: "user-1", email: "user@example.com", name: "User" } as User,
    });
    useWorkspaceRequestStore.setState({
      browserRequestsByGroup: {},
      terminalRequestsByGroup: {},
    });
    await act(async () => {
      renderer = create(<BrowserRequestHarness />);
    });

    if (!renderer) throw new Error("Expected the workspace to mount");
    expect(renderer.root.findByProps({ "data-rendered-tab": "chat" })).toBeDefined();

    await act(async () => {
      reconcileWorkspaceRequestEvent(browserRequestEvent());
    });

    expect(
      renderer.root.findByProps({ "data-rendered-tab": "draft:browser-request-1" }),
    ).toBeDefined();
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
    const setItem = vi.fn();
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => JSON.stringify(layout)),
      setItem,
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

    setItem.mockClear();
    await act(async () => {
      const moveListener = addEventListener.mock.calls.find(([type]) => type === "pointermove")?.[1];
      moveListener?.({ clientX: 600, clientY: 300 });
    });

    await act(async () => renderer?.unmount());
    renderer = null;
    expect(removeEventListener).toHaveBeenCalledWith("pointermove", expect.any(Function));
    expect(document.body.style.cursor).toBe("default");
    expect(document.body.style.userSelect).toBe("text");
    expect(setItem).toHaveBeenCalledWith("spatial-workspace-resize-cleanup", expect.any(String));
  });

  it("holds layout persistence until a resize drag settles", async () => {
    const persistenceKey = "spatial-workspace-resize-persistence-test";
    const layout = dockSpatialTab(
      createSpatialLayout(["first", "second"], "first"),
      "second",
      "right",
      "full",
    );
    const setItem = vi.fn();
    const listeners = new Map<string, (event: unknown) => void>();
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => JSON.stringify(layout)),
      setItem,
    });
    vi.stubGlobal("window", {
      addEventListener: (type: string, listener: (event: unknown) => void) =>
        listeners.set(type, listener),
      removeEventListener: (type: string) => listeners.delete(type),
    });
    vi.stubGlobal("document", {
      body: { style: { cursor: "default", userSelect: "text" } },
      documentElement: { scrollLeft: 0, scrollTop: 0 },
    });

    await act(async () => {
      renderer = create(
        <SpatialWorkspace
          persistenceKey={persistenceKey}
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

    setItem.mockClear();
    // The handle drives onResize from pointermove; serializing and writing the
    // whole tree once per frame is what this guards against.
    for (const clientX of [400, 420, 440, 460]) {
      await act(async () => {
        listeners.get("pointermove")?.({ clientX, clientY: 300 });
      });
    }
    expect(setItem).not.toHaveBeenCalled();

    await act(async () => {
      listeners.get("pointerup")?.({});
    });
    expect(setItem).toHaveBeenCalledWith(persistenceKey, expect.any(String));
  });
});
