import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserWindow } from "electron";

const electronMocks = vi.hoisted(() => {
  type Listener = (...args: unknown[]) => void;

  class MockEmitter {
    private readonly listeners = new Map<string, Listener[]>();

    on(event: string, listener: Listener) {
      this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
      return this;
    }

    once(event: string, listener: Listener) {
      const wrapped: Listener = (...args) => {
        this.removeListener(event, wrapped);
        listener(...args);
      };
      return this.on(event, wrapped);
    }

    removeListener(event: string, listener: Listener) {
      this.listeners.set(
        event,
        (this.listeners.get(event) ?? []).filter((candidate) => candidate !== listener),
      );
      return this;
    }

    emit(event: string, ...args: unknown[]) {
      for (const listener of [...(this.listeners.get(event) ?? [])]) listener(...args);
    }
  }

  type PermissionRequestHandler = (
    webContents: MockWebContents,
    permission: string,
    callback: (allowed: boolean) => void,
    details: { requestingUrl: string; isMainFrame: boolean },
  ) => void;
  type PermissionCheckHandler = (
    webContents: MockWebContents | null,
    permission: string,
    requestingOrigin: string,
    details: { requestingUrl?: string; isMainFrame: boolean },
  ) => boolean;
  type WindowOpenHandler = (details: { url: string }) => {
    action: string;
    overrideBrowserWindowOptions?: Record<string, unknown>;
  };

  class MockSession {
    permissionRequestHandler: PermissionRequestHandler | null = null;
    permissionCheckHandler: PermissionCheckHandler | null = null;
    devicePermissionHandler: (() => boolean) | null = null;
    addWordToSpellCheckerDictionary = vi.fn();

    setPermissionRequestHandler(handler: PermissionRequestHandler) {
      this.permissionRequestHandler = handler;
    }

    setPermissionCheckHandler(handler: PermissionCheckHandler) {
      this.permissionCheckHandler = handler;
    }

    setDevicePermissionHandler(handler: () => boolean) {
      this.devicePermissionHandler = handler;
    }
  }

  class MockWebContents extends MockEmitter {
    readonly session = sharedSession;
    readonly operations: string[] = [];
    readonly navigationHistory = {
      canGoBack: () => false,
      canGoForward: () => false,
      goBack: vi.fn(),
      goForward: vi.fn(),
    };
    private url = "about:blank";
    private title = "New tab";
    private loading = false;
    private devToolsOpen = false;
    private debuggerAttached = false;
    closed = false;
    audioMuted = false;
    windowOpenHandler: WindowOpenHandler | null = null;
    readonly debugger = {
      isAttached: () => this.debuggerAttached,
      attach: (_version: string) => {
        this.operations.push("debugger:attach");
        this.debuggerAttached = true;
      },
      sendCommand: async (_method: string, params: { state: string }) => {
        this.operations.push(`lifecycle:${params.state}`);
      },
    };

    async loadURL(url: string) {
      this.operations.push(`load:${url}`);
      this.url = url;
      this.emit("did-navigate");
    }

    getURL() {
      return this.url;
    }

    setURL(url: string) {
      this.url = url;
      this.emit("did-navigate");
    }

    getTitle() {
      return this.title;
    }

    isLoading() {
      return this.loading;
    }

    isDevToolsOpened() {
      return this.devToolsOpen;
    }

    openDevTools() {
      this.operations.push("devtools:open");
      this.devToolsOpen = true;
      this.debuggerAttached = false;
      this.emit("devtools-opened");
    }

    closeDevTools() {
      this.operations.push("devtools:close");
      this.devToolsOpen = false;
      this.emit("devtools-closed");
    }

    setAudioMuted(muted: boolean) {
      this.audioMuted = muted;
      this.operations.push(`audio:${muted}`);
    }

    setWindowOpenHandler(handler: WindowOpenHandler) {
      this.windowOpenHandler = handler;
    }

    reload = vi.fn();
    replaceMisspelling = vi.fn();
    inspectElement = vi.fn();

    close() {
      this.closed = true;
      this.emit("destroyed");
    }
  }

  class MockWebContentsView {
    readonly webContents = new MockWebContents();
    readonly setBounds = vi.fn();

    constructor(_options: unknown) {
      views.push(this);
    }
  }

  const views: MockWebContentsView[] = [];
  const sharedSession = new MockSession();
  const showMessageBox = vi.fn(async () => ({ response: 1 }));

  return {
    MockSession,
    MockWebContents,
    MockWebContentsView,
    sharedSession,
    showMessageBox,
    views,
  };
});

vi.mock("electron", () => ({
  app: { getPath: () => "/tmp" },
  BrowserWindow: class {},
  clipboard: { writeText: vi.fn() },
  dialog: { showMessageBox: electronMocks.showMessageBox },
  Menu: { buildFromTemplate: () => ({ popup: vi.fn() }) },
  WebContentsView: electronMocks.MockWebContentsView,
}));

import {
  BrowserWorkspaceManager,
  type BrowserWorkspaceSnapshot,
  type BrowserWorkspaceSnapshotStore,
} from "./browser-workspaces.js";

class MemorySnapshotStore implements BrowserWorkspaceSnapshotStore {
  value: unknown = [];
  writes: BrowserWorkspaceSnapshot[][] = [];
  concurrentWrites = 0;
  maxConcurrentWrites = 0;

  async read(): Promise<unknown> {
    return this.value;
  }

  async write(snapshots: BrowserWorkspaceSnapshot[]): Promise<void> {
    this.concurrentWrites += 1;
    this.maxConcurrentWrites = Math.max(this.maxConcurrentWrites, this.concurrentWrites);
    await new Promise((resolve) => setTimeout(resolve, 5));
    this.writes.push(structuredClone(snapshots));
    this.value = structuredClone(snapshots);
    this.concurrentWrites -= 1;
  }
}

function createWindow(zoomFactor = 1): BrowserWindow {
  return {
    isDestroyed: () => false,
    contentView: {
      addChildView: vi.fn(),
      removeChildView: vi.fn(),
    },
    webContents: { send: vi.fn(), getZoomFactor: () => zoomFactor },
  } as unknown as BrowserWindow;
}

function latestContents() {
  const view = electronMocks.views.at(-1);
  if (!view) throw new Error("Expected a browser view.");
  return view.webContents;
}

beforeEach(() => {
  electronMocks.views.length = 0;
  electronMocks.sharedSession.permissionRequestHandler = null;
  electronMocks.sharedSession.permissionCheckHandler = null;
  electronMocks.sharedSession.devicePermissionHandler = null;
  electronMocks.showMessageBox.mockClear();
});

describe("BrowserWorkspaceManager", () => {
  it("does not load blank workspaces or duplicate a restored navigation", async () => {
    const blankManager = new BrowserWorkspaceManager({
      snapshotStore: new MemorySnapshotStore(),
    });
    blankManager.setWindow(createWindow());
    await blankManager.activate("group-blank", "browser-blank");
    expect(latestContents().operations).not.toContain("load:about:blank");

    const store = new MemorySnapshotStore();
    store.value = [
      {
        sessionGroupId: "group-restored",
        browserId: "browser-restored",
        url: "https://google.com/",
      },
    ];
    const restoredManager = new BrowserWorkspaceManager({ snapshotStore: store });
    restoredManager.setWindow(createWindow());
    await restoredManager.activate("group-restored", "browser-restored");
    await restoredManager.navigate("group-restored", "browser-restored", "https://google.com/");

    expect(
      latestContents().operations.filter((operation) => operation === "load:https://google.com/"),
    ).toHaveLength(1);
  });

  it("scales native bounds with the Trace window zoom factor", async () => {
    const manager = new BrowserWorkspaceManager({ snapshotStore: new MemorySnapshotStore() });
    manager.setWindow(createWindow(0.8));
    await manager.activate("group-a");

    manager.setBounds("group-a", "default", {
      x: 1_100,
      y: 150,
      width: 1_100,
      height: 900,
    });

    expect(electronMocks.views[0].setBounds).toHaveBeenCalledWith({
      x: 880,
      y: 120,
      width: 880,
      height: 720,
    });
  });

  it("detaches the native view while a React overlay is visible", async () => {
    const manager = new BrowserWorkspaceManager({ snapshotStore: new MemorySnapshotStore() });
    const window = createWindow();
    manager.setWindow(window);
    await manager.activate("group-a");
    const view = electronMocks.views[0];

    manager.setOverlayHidden("group-a", "default", true);
    expect(window.contentView.removeChildView).toHaveBeenCalledWith(view);
    expect(latestContents().operations).not.toContain("lifecycle:frozen");

    manager.setOverlayHidden("group-a", "default", false);
    expect(window.contentView.addChildView).toHaveBeenLastCalledWith(view);
  });

  it("keeps multiple browser tabs visible with independent native views", async () => {
    const manager = new BrowserWorkspaceManager({ snapshotStore: new MemorySnapshotStore() });
    const window = createWindow();
    manager.setWindow(window);

    const firstState = await manager.activate("group-a", "browser-a");
    const firstView = electronMocks.views[0];
    const secondState = await manager.activate("group-a", "browser-b");
    const secondView = electronMocks.views[1];

    expect(firstState.browserId).toBe("browser-a");
    expect(secondState.browserId).toBe("browser-b");
    expect(firstView).not.toBe(secondView);
    expect(window.contentView.addChildView).toHaveBeenCalledWith(firstView);
    expect(window.contentView.addChildView).toHaveBeenCalledWith(secondView);

    await manager.navigate("group-a", "browser-a", "https://first.example");
    await manager.navigate("group-a", "browser-b", "https://second.example");
    expect(firstView.webContents.getURL()).toBe("https://first.example/");
    expect(secondView.webContents.getURL()).toBe("https://second.example/");

    await manager.hide("group-a", "browser-a");
    expect(window.contentView.removeChildView).toHaveBeenCalledWith(firstView);
    await expect(manager.reload("group-a", "browser-b")).resolves.toMatchObject({
      browserId: "browser-b",
    });
  });

  it("destroys a closed browser and removes its persisted snapshot", async () => {
    const store = new MemorySnapshotStore();
    const manager = new BrowserWorkspaceManager({ snapshotStore: store });
    const window = createWindow();
    manager.setWindow(window);
    await manager.activate("group-a", "browser-a");
    const contents = latestContents();
    contents.setURL("https://private.example/token");

    await manager.destroy("group-a", "browser-a");

    expect(contents.closed).toBe(true);
    expect(window.contentView.removeChildView).toHaveBeenCalledWith(electronMocks.views[0]);
    expect(store.value).toEqual([]);
    await manager.activate("group-a", "browser-a");
    expect(latestContents()).not.toBe(contents);
    expect(latestContents().getURL()).toBe("about:blank");
  });

  it("destroys every browser and snapshot for an archived session group", async () => {
    const store = new MemorySnapshotStore();
    const manager = new BrowserWorkspaceManager({ snapshotStore: store });
    const window = createWindow();
    manager.setWindow(window);
    await manager.activate("group-a", "browser-a");
    const firstContents = latestContents();
    await manager.activate("group-a", "browser-b");
    const secondContents = latestContents();
    await manager.activate("group-b", "browser-c");

    await manager.destroyAllForSessionGroup("group-a");

    expect(firstContents.closed).toBe(true);
    expect(secondContents.closed).toBe(true);
    expect(latestContents().closed).toBe(false);
    expect(store.value).toEqual([
      { sessionGroupId: "group-b", browserId: "browser-c", url: "about:blank" },
    ]);
    expect(window.contentView.removeChildView).toHaveBeenCalledTimes(2);
  });

  it("closes DevTools before freezing and restores them after activation", async () => {
    const manager = new BrowserWorkspaceManager({ snapshotStore: new MemorySnapshotStore() });
    manager.setWindow(createWindow());

    await manager.activate("group-a");
    const contents = latestContents();
    await manager.toggleDevTools("group-a");
    await manager.hide("group-a");

    expect(contents.operations).toContain("devtools:close");
    expect(contents.operations.indexOf("devtools:close")).toBeLessThan(
      contents.operations.lastIndexOf("lifecycle:frozen"),
    );
    expect(contents.audioMuted).toBe(true);

    const state = await manager.activate("group-a");
    expect(state.suspensionState).toBe("active");
    expect(contents.audioMuted).toBe(false);
    expect(contents.isDevToolsOpened()).toBe(true);
    expect(contents.operations.lastIndexOf("lifecycle:active")).toBeLessThan(
      contents.operations.lastIndexOf("devtools:open"),
    );
  });

  it("denies dangerous permissions and caches explicit per-origin decisions", async () => {
    const prompt = vi.fn(async () => true);
    const manager = new BrowserWorkspaceManager({
      snapshotStore: new MemorySnapshotStore(),
      permissionPrompt: prompt,
    });
    manager.setWindow(createWindow());
    await manager.activate("group-a");
    const contents = latestContents();
    const request = electronMocks.sharedSession.permissionRequestHandler;
    const check = electronMocks.sharedSession.permissionCheckHandler;
    if (!request || !check) throw new Error("Expected permission handlers.");

    const mediaDecision = await new Promise<boolean>((resolve) => {
      request(contents, "media", resolve, {
        requestingUrl: "https://example.com/camera",
        isMainFrame: true,
      });
    });
    expect(mediaDecision).toBe(true);
    expect(prompt).toHaveBeenCalledWith({ origin: "https://example.com", permission: "media" });
    expect(
      check(contents, "media", "https://example.com", {
        requestingUrl: "https://example.com/other",
        isMainFrame: true,
      }),
    ).toBe(true);

    const filesystemDecision = await new Promise<boolean>((resolve) => {
      request(contents, "fileSystem", resolve, {
        requestingUrl: "https://example.com/files",
        isMainFrame: true,
      });
    });
    expect(filesystemDecision).toBe(false);
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(electronMocks.sharedSession.devicePermissionHandler?.()).toBe(false);
  });

  it("opens web popups as Trace browser tabs and rejects non-web popup protocols", async () => {
    const manager = new BrowserWorkspaceManager({ snapshotStore: new MemorySnapshotStore() });
    const window = createWindow();
    manager.setWindow(window);
    await manager.activate("group-a");
    vi.mocked(window.webContents.send).mockClear();
    const handler = latestContents().windowOpenHandler;
    if (!handler) throw new Error("Expected a popup handler.");

    const allowed = handler({ url: "https://accounts.example.com/login" });
    expect(allowed).toEqual({ action: "deny" });
    expect(window.webContents.send).toHaveBeenCalledWith("browser-tab-open-requested", {
      sessionGroupId: "group-a",
      url: "https://accounts.example.com/login",
    });
    expect(handler({ url: "file:///etc/passwd" })).toEqual({ action: "deny" });
    expect(window.webContents.send).toHaveBeenCalledTimes(1);
  });

  it("rejects non-web URLs restored from persisted workspace state", async () => {
    const store = new MemorySnapshotStore();
    store.value = [{ sessionGroupId: "group-a", url: "file:///etc/passwd" }];
    const manager = new BrowserWorkspaceManager({ snapshotStore: store });
    manager.setWindow(createWindow());

    await manager.activate("group-a");

    expect(latestContents().getURL()).toBe("about:blank");
  });

  it("serializes and coalesces workspace snapshot writes", async () => {
    const store = new MemorySnapshotStore();
    const manager = new BrowserWorkspaceManager({
      snapshotStore: store,
      persistenceDelayMs: 1_000,
    });
    manager.setWindow(createWindow());
    await manager.activate("group-a");
    const contents = latestContents();

    contents.setURL("https://first.example/");
    const firstFlush = manager.flushPersistence();
    contents.setURL("https://last.example/");
    const secondFlush = manager.flushPersistence();
    await Promise.all([firstFlush, secondFlush]);

    expect(store.maxConcurrentWrites).toBe(1);
    expect(store.writes.at(-1)).toEqual([
      { sessionGroupId: "group-a", browserId: "default", url: "https://last.example/" },
    ]);
  });

  it("evicts the least recently active renderer while retaining its URL snapshot", async () => {
    const store = new MemorySnapshotStore();
    const manager = new BrowserWorkspaceManager({
      maxRetainedWorkspaces: 2,
      snapshotStore: store,
    });
    manager.setWindow(createWindow());

    await manager.activate("group-a");
    const firstContents = latestContents();
    firstContents.setURL("https://a.example/");
    await manager.hide("group-a");
    await manager.activate("group-b");
    await manager.hide("group-b");
    await manager.activate("group-c");

    expect(firstContents.closed).toBe(true);
    await manager.activate("group-a");
    expect(latestContents()).not.toBe(firstContents);
    expect(latestContents().getURL()).toBe("https://a.example/");
  });
});
