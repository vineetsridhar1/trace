import { isWorkspaceBrowserUrl, normalizeWorkspaceBrowserUrl } from "@trace/shared";
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  Menu,
  type MenuItemConstructorOptions,
  type Session,
  type WebContents,
  WebContentsView,
  type WindowOpenHandlerResponse,
} from "electron";
import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export type BrowserWorkspaceState = {
  sessionGroupId: string;
  browserId: string;
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  loading: boolean;
  devToolsOpen: boolean;
  suspensionState: "active" | "frozen" | "muted";
};

export type BrowserWorkspaceSnapshot = Pick<BrowserWorkspaceState, "sessionGroupId" | "url"> & {
  browserId?: string;
};

export interface BrowserWorkspaceSnapshotStore {
  read(): Promise<unknown>;
  write(snapshots: BrowserWorkspaceSnapshot[]): Promise<void>;
}

export type BrowserPermissionPrompt = {
  origin: string;
  permission: string;
};

type BrowserWorkspaceManagerOptions = {
  maxRetainedWorkspaces?: number;
  persistenceDelayMs?: number;
  permissionPrompt?: (request: BrowserPermissionPrompt) => Promise<boolean>;
  snapshotStore?: BrowserWorkspaceSnapshotStore;
};

type BrowserWorkspace = {
  key: string;
  view: WebContentsView;
  state: BrowserWorkspaceState;
  lastActivatedOrder: number;
  reopenDevToolsOnActivate: boolean;
  overlayHidden: boolean;
  pendingNavigation: { url: string; promise: Promise<void> } | null;
};

type PermissionRequestHandler = NonNullable<Parameters<Session["setPermissionRequestHandler"]>[0]>;
type BrowserPermission = Parameters<PermissionRequestHandler>[1];
type BrowserPermissionDetails = Parameters<PermissionRequestHandler>[3];

const BROWSER_PARTITION = "persist:trace-browser";
const STATE_FILE_NAME = "browser-workspaces.json";
const DEFAULT_MAX_RETAINED_WORKSPACES = 12;
const DEFAULT_PERSISTENCE_DELAY_MS = 100;
const DEVTOOLS_CLOSE_TIMEOUT_MS = 1_000;
const PROMPTABLE_PERMISSIONS = new Set<string>([
  "clipboard-read",
  "fullscreen",
  "geolocation",
  "idle-detection",
  "keyboardLock",
  "media",
  "mediaKeySystem",
  "midi",
  "midiSysex",
  "notifications",
  "pointerLock",
  "speaker-selection",
]);

/**
 * Owns the native Chromium pages used by session-group browsers. React can
 * mount and unmount freely; keeping a workspace here keeps its page process,
 * history, media position, and DevTools target alive.
 */
export class BrowserWorkspaceManager {
  private readonly workspaces = new Map<string, BrowserWorkspace>();
  private readonly snapshots = new Map<string, BrowserWorkspaceSnapshot>();
  private readonly configuredSessions = new WeakSet<Session>();
  private readonly permissionDecisions = new Map<string, boolean>();
  private readonly pendingPermissionPrompts = new Map<string, Promise<boolean>>();
  private readonly maxRetainedWorkspaces: number;
  private readonly persistenceDelayMs: number;
  private readonly permissionPrompt: (request: BrowserPermissionPrompt) => Promise<boolean>;
  private readonly snapshotStore: BrowserWorkspaceSnapshotStore;
  private window: BrowserWindow | null = null;
  private readonly visibleWorkspaceIds = new Set<string>();
  private loadStatePromise: Promise<void> | null = null;
  private activationOrder = 0;
  private persistenceDirty = false;
  private persistenceTimer: ReturnType<typeof setTimeout> | null = null;
  private persistenceChain: Promise<void> = Promise.resolve();

  constructor(options: BrowserWorkspaceManagerOptions = {}) {
    this.maxRetainedWorkspaces = Math.max(
      1,
      options.maxRetainedWorkspaces ?? DEFAULT_MAX_RETAINED_WORKSPACES,
    );
    this.persistenceDelayMs = Math.max(
      0,
      options.persistenceDelayMs ?? DEFAULT_PERSISTENCE_DELAY_MS,
    );
    this.permissionPrompt =
      options.permissionPrompt ?? ((request) => this.showPermissionPrompt(request));
    this.snapshotStore = options.snapshotStore ?? new FileBrowserWorkspaceSnapshotStore();
  }

  setWindow(window: BrowserWindow | null) {
    this.window = window;
  }

  async activate(sessionGroupId: string, browserId = "default"): Promise<BrowserWorkspaceState> {
    await this.loadSnapshots();
    const workspace = this.getOrCreate(sessionGroupId, browserId);
    workspace.overlayHidden = false;
    if (this.window && !this.window.isDestroyed()) {
      this.window.contentView.addChildView(workspace.view);
    }
    this.visibleWorkspaceIds.add(workspace.key);
    workspace.lastActivatedOrder = ++this.activationOrder;
    try {
      workspace.state.suspensionState = await this.setFrozen(workspace, false);
    } catch (error) {
      if (this.window && !this.window.isDestroyed()) {
        this.window.contentView.removeChildView(workspace.view);
      }
      this.visibleWorkspaceIds.delete(workspace.key);
      throw error;
    }
    this.evictInactiveWorkspaces();
    this.updateState(workspace);
    return workspace.state;
  }

  async hide(sessionGroupId: string, browserId = "default"): Promise<void> {
    const key = browserWorkspaceKey(sessionGroupId, browserId);
    const workspace = this.workspaces.get(key);
    if (!workspace || !this.visibleWorkspaceIds.has(key)) return;

    if (this.window && !this.window.isDestroyed()) {
      this.window.contentView.removeChildView(workspace.view);
    }
    this.visibleWorkspaceIds.delete(key);
    workspace.state.suspensionState = await this.setFrozen(workspace, true);
    this.persistWorkspace(workspace);
    await this.flushPersistence();
    this.publish(workspace);
  }

  async destroy(sessionGroupId: string, browserId = "default"): Promise<void> {
    await this.loadSnapshots();
    const key = browserWorkspaceKey(sessionGroupId, browserId);
    const workspace = this.workspaces.get(key);
    if (workspace) {
      if (this.window && !this.window.isDestroyed() && this.visibleWorkspaceIds.has(key)) {
        this.window.contentView.removeChildView(workspace.view);
      }
      this.visibleWorkspaceIds.delete(key);
      this.workspaces.delete(key);
      workspace.view.webContents.close();
    }
    if (!this.snapshots.delete(key)) return;
    this.persistenceDirty = true;
    await this.flushPersistence();
  }

  setBounds(sessionGroupId: string, browserId: string, bounds: Electron.Rectangle) {
    const key = browserWorkspaceKey(sessionGroupId, browserId);
    if (!this.visibleWorkspaceIds.has(key)) return;
    const workspace = this.workspaces.get(key);
    if (!workspace) return;
    const zoomFactor = this.window?.webContents.getZoomFactor() ?? 1;
    workspace.view.setBounds(scaleRectangle(bounds, zoomFactor));
  }

  setOverlayHidden(sessionGroupId: string, browserId: string, hidden: boolean) {
    const key = browserWorkspaceKey(sessionGroupId, browserId);
    if (!this.visibleWorkspaceIds.has(key)) return;
    const workspace = this.workspaces.get(key);
    if (!workspace || workspace.overlayHidden === hidden) return;
    workspace.overlayHidden = hidden;
    if (!this.window || this.window.isDestroyed()) return;
    if (hidden) this.window.contentView.removeChildView(workspace.view);
    else this.window.contentView.addChildView(workspace.view);
  }

  async navigate(
    sessionGroupId: string,
    browserId: string,
    rawUrl: string,
  ): Promise<BrowserWorkspaceState> {
    const workspace = this.requireActiveWorkspace(sessionGroupId, browserId);
    const url = normalizeUrl(rawUrl);
    if (workspace.view.webContents.getURL() === url && !workspace.pendingNavigation) {
      return workspace.state;
    }
    await this.loadWorkspaceUrl(workspace, url);
    return workspace.state;
  }

  async goBack(sessionGroupId: string, browserId = "default"): Promise<BrowserWorkspaceState> {
    const workspace = this.requireActiveWorkspace(sessionGroupId, browserId);
    if (workspace.view.webContents.navigationHistory.canGoBack()) {
      workspace.view.webContents.navigationHistory.goBack();
    }
    return workspace.state;
  }

  async goForward(sessionGroupId: string, browserId = "default"): Promise<BrowserWorkspaceState> {
    const workspace = this.requireActiveWorkspace(sessionGroupId, browserId);
    if (workspace.view.webContents.navigationHistory.canGoForward()) {
      workspace.view.webContents.navigationHistory.goForward();
    }
    return workspace.state;
  }

  async reload(sessionGroupId: string, browserId = "default"): Promise<BrowserWorkspaceState> {
    const workspace = this.requireActiveWorkspace(sessionGroupId, browserId);
    workspace.view.webContents.reload();
    return workspace.state;
  }

  async toggleDevTools(
    sessionGroupId: string,
    browserId = "default",
  ): Promise<BrowserWorkspaceState> {
    const workspace = this.requireActiveWorkspace(sessionGroupId, browserId);
    const contents = workspace.view.webContents;
    if (contents.isDevToolsOpened()) contents.closeDevTools();
    else contents.openDevTools({ mode: "right", title: "Trace Browser DevTools" });
    this.updateState(workspace);
    return workspace.state;
  }

  async flushPersistence(): Promise<void> {
    if (this.persistenceTimer) {
      clearTimeout(this.persistenceTimer);
      this.persistenceTimer = null;
    }
    if (!this.persistenceDirty) {
      await this.persistenceChain;
      return;
    }

    this.persistenceDirty = false;
    const snapshots = [...this.snapshots.values()];
    this.persistenceChain = this.persistenceChain
      .then(() => this.snapshotStore.write(snapshots))
      .catch((error: unknown) => {
        console.warn("[browser] failed to persist browser workspaces", error);
      });
    await this.persistenceChain;
  }

  private requireActiveWorkspace(sessionGroupId: string, browserId: string): BrowserWorkspace {
    const key = browserWorkspaceKey(sessionGroupId, browserId);
    if (!this.visibleWorkspaceIds.has(key)) {
      throw new Error("Browser workspace is not active.");
    }
    const workspace = this.workspaces.get(key);
    if (!workspace) throw new Error("Browser workspace was not created.");
    return workspace;
  }

  private getOrCreate(sessionGroupId: string, browserId: string): BrowserWorkspace {
    const key = browserWorkspaceKey(sessionGroupId, browserId);
    const existing = this.workspaces.get(key);
    if (existing) return existing;

    const snapshot = this.snapshots.get(key);
    const view = new WebContentsView({
      webPreferences: browserWebPreferences(),
    });
    const workspace: BrowserWorkspace = {
      key,
      view,
      state: {
        sessionGroupId,
        browserId,
        url: snapshot?.url ?? "about:blank",
        title: "New tab",
        canGoBack: false,
        canGoForward: false,
        loading: false,
        devToolsOpen: false,
        suspensionState: "active",
      },
      lastActivatedOrder: ++this.activationOrder,
      reopenDevToolsOnActivate: false,
      overlayHidden: false,
      pendingNavigation: null,
    };
    this.workspaces.set(key, workspace);
    this.configureSession(view.webContents.session);
    this.bindWorkspaceEvents(workspace);
    this.configureWindowOpening(workspace);
    if (workspace.state.url !== "about:blank") {
      void this.loadWorkspaceUrl(workspace, workspace.state.url).catch((error: unknown) => {
        console.warn("[browser] failed to restore browser workspace", error);
      });
    }
    return workspace;
  }

  private loadWorkspaceUrl(workspace: BrowserWorkspace, url: string): Promise<void> {
    if (workspace.pendingNavigation?.url === url) return workspace.pendingNavigation.promise;

    const promise = workspace.view.webContents
      .loadURL(url)
      .then(() => undefined)
      .catch((error: unknown) => {
        if (!isAbortedNavigation(error)) throw error;
      })
      .finally(() => {
        if (workspace.pendingNavigation?.promise === promise) {
          workspace.pendingNavigation = null;
        }
      });
    workspace.pendingNavigation = { url, promise };
    return promise;
  }

  private bindWorkspaceEvents(workspace: BrowserWorkspace) {
    const { webContents } = workspace.view;
    const sync = () => this.updateState(workspace);
    webContents.on("did-start-loading", sync);
    webContents.on("did-stop-loading", sync);
    webContents.on("did-navigate", sync);
    webContents.on("did-navigate-in-page", sync);
    webContents.on("page-title-updated", sync);
    webContents.on("devtools-opened", sync);
    webContents.on("devtools-closed", sync);
    this.bindContextMenu(webContents);
    webContents.on("destroyed", () => {
      if (this.workspaces.get(workspace.key) === workspace) {
        this.workspaces.delete(workspace.key);
        this.visibleWorkspaceIds.delete(workspace.key);
      }
    });
  }

  private bindContextMenu(webContents: WebContents) {
    webContents.on("context-menu", (_event, params) => {
      const template: MenuItemConstructorOptions[] = [
        {
          label: "Back",
          enabled: webContents.navigationHistory.canGoBack(),
          click: () => webContents.navigationHistory.goBack(),
        },
        {
          label: "Forward",
          enabled: webContents.navigationHistory.canGoForward(),
          click: () => webContents.navigationHistory.goForward(),
        },
        { label: "Reload", click: () => webContents.reload() },
      ];

      if (params.linkURL) {
        template.push(
          { type: "separator" },
          {
            label: "Open Link",
            click: () => {
              try {
                void webContents.loadURL(normalizeUrl(params.linkURL)).catch((error: unknown) => {
                  console.warn("[browser] context-menu navigation failed", error);
                });
              } catch (error) {
                console.warn("[browser] refused context-menu navigation", error);
              }
            },
          },
          { label: "Copy Link", click: () => clipboard.writeText(params.linkURL) },
        );
      }

      if (params.misspelledWord) {
        template.push({ type: "separator" });
        for (const suggestion of params.dictionarySuggestions) {
          template.push({
            label: suggestion,
            click: () => webContents.replaceMisspelling(suggestion),
          });
        }
        if (params.dictionarySuggestions.length === 0) {
          template.push({ label: "No suggestions", enabled: false });
        }
        template.push({
          label: "Add to Dictionary",
          click: () => webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
        });
      }

      if (params.isEditable || params.selectionText) {
        template.push({ type: "separator" });
        if (params.isEditable) {
          template.push(
            { role: "cut", enabled: params.editFlags.canCut },
            { role: "copy", enabled: params.editFlags.canCopy },
            { role: "paste", enabled: params.editFlags.canPaste },
          );
        } else {
          template.push({ role: "copy", enabled: params.editFlags.canCopy });
        }
        template.push({ role: "selectAll" });
      }

      template.push(
        { type: "separator" },
        {
          label: "Inspect Element",
          click: () => {
            webContents.inspectElement(params.x, params.y);
            webContents.openDevTools({ mode: "right", title: "Trace Browser DevTools" });
          },
        },
      );
      Menu.buildFromTemplate(template).popup({ window: this.window ?? undefined });
    });
  }

  private configureWindowOpening(workspace: BrowserWorkspace) {
    workspace.view.webContents.setWindowOpenHandler(({ url }) => this.windowOpenResponse(workspace, url));
  }

  private windowOpenResponse(
    workspace: BrowserWorkspace,
    url: string,
  ): WindowOpenHandlerResponse {
    if (!isAllowedBrowserUrl(url)) return { action: "deny" };
    this.window?.webContents.send("browser-tab-open-requested", {
      sessionGroupId: workspace.state.sessionGroupId,
      url,
    });
    return { action: "deny" };
  }

  private configureSession(browserSession: Session) {
    if (this.configuredSessions.has(browserSession)) return;
    this.configuredSessions.add(browserSession);
    browserSession.setPermissionCheckHandler(
      (_webContents, permission, requestingOrigin, details) => {
        const origin = permissionOrigin(details.requestingUrl ?? requestingOrigin);
        return origin
          ? this.permissionDecisions.get(permissionDecisionKey(origin, permission)) === true
          : false;
      },
    );
    browserSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
      void this.handlePermissionRequest(webContents, permission, callback, details);
    });
    browserSession.setDevicePermissionHandler(() => false);
  }

  private async handlePermissionRequest(
    webContents: WebContents,
    permission: BrowserPermission,
    callback: (permissionGranted: boolean) => void,
    details: BrowserPermissionDetails,
  ) {
    const origin = permissionOrigin(details.requestingUrl || webContents.getURL());
    if (!origin || !PROMPTABLE_PERMISSIONS.has(permission)) {
      callback(false);
      return;
    }

    const key = permissionDecisionKey(origin, permission);
    const existing = this.permissionDecisions.get(key);
    if (existing !== undefined) {
      callback(existing);
      return;
    }

    let prompt = this.pendingPermissionPrompts.get(key);
    if (!prompt) {
      prompt = this.permissionPrompt({ origin, permission }).catch((error: unknown) => {
        console.warn("[browser] permission prompt failed", error);
        return false;
      });
      this.pendingPermissionPrompts.set(key, prompt);
    }
    const allowed = await prompt;
    this.pendingPermissionPrompts.delete(key);
    this.permissionDecisions.set(key, allowed);
    callback(allowed);
  }

  private async showPermissionPrompt(request: BrowserPermissionPrompt): Promise<boolean> {
    if (!this.window || this.window.isDestroyed()) return false;
    const result = await dialog.showMessageBox(this.window, {
      type: "question",
      buttons: ["Allow", "Deny"],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
      title: "Website permission",
      message: `${request.origin} wants permission to use ${permissionLabel(request.permission)}.`,
      detail: "Only allow this if you trust the website.",
    });
    return result.response === 0;
  }

  private updateState(workspace: BrowserWorkspace) {
    const contents = workspace.view.webContents;
    workspace.state = {
      ...workspace.state,
      url: contents.getURL() || workspace.state.url,
      title: contents.getTitle() || "New tab",
      canGoBack: contents.navigationHistory.canGoBack(),
      canGoForward: contents.navigationHistory.canGoForward(),
      loading: contents.isLoading(),
      devToolsOpen: contents.isDevToolsOpened(),
    };
    this.persistWorkspace(workspace);
    this.publish(workspace);
  }

  private publish(workspace: BrowserWorkspace) {
    if (!this.window || this.window.isDestroyed()) return;
    this.window.webContents.send("browser-workspace-state", workspace.state);
  }

  private async setFrozen(
    workspace: BrowserWorkspace,
    frozen: boolean,
  ): Promise<BrowserWorkspaceState["suspensionState"]> {
    const { webContents } = workspace.view;
    if (frozen && webContents.isDevToolsOpened()) {
      workspace.reopenDevToolsOnActivate = true;
      await closeDevTools(webContents);
    }

    try {
      if (!webContents.debugger.isAttached()) webContents.debugger.attach("1.3");
      await webContents.debugger.sendCommand("Page.setWebLifecycleState", {
        state: frozen ? "frozen" : "active",
      });
    } catch (error) {
      console.warn(
        `[browser] failed to ${frozen ? "freeze" : "activate"} browser workspace`,
        error,
      );
      webContents.setAudioMuted(frozen);
      if (frozen) return "muted";
      throw new Error("Unable to resume the browser workspace.");
    }

    webContents.setAudioMuted(frozen);
    if (!frozen && workspace.reopenDevToolsOnActivate) {
      workspace.reopenDevToolsOnActivate = false;
      webContents.openDevTools({ mode: "right", title: "Trace Browser DevTools" });
    }
    return frozen ? "frozen" : "active";
  }

  private async loadSnapshots() {
    if (!this.loadStatePromise) this.loadStatePromise = this.readSnapshots();
    await this.loadStatePromise;
  }

  private async readSnapshots() {
    try {
      const snapshots = await this.snapshotStore.read();
      if (!Array.isArray(snapshots)) return;
      for (const snapshot of snapshots) {
        if (!isSnapshot(snapshot)) continue;
        this.snapshots.set(
          browserWorkspaceKey(snapshot.sessionGroupId, snapshot.browserId ?? "default"),
          snapshot,
        );
      }
    } catch (error) {
      if (!isFileNotFoundError(error)) {
        console.warn("[browser] failed to restore browser workspaces", error);
      }
    }
  }

  private persistWorkspace(workspace: BrowserWorkspace) {
    this.snapshots.set(workspace.key, {
      sessionGroupId: workspace.state.sessionGroupId,
      browserId: workspace.state.browserId,
      url: workspace.state.url,
    });
    this.persistenceDirty = true;
    if (this.persistenceTimer) return;
    this.persistenceTimer = setTimeout(() => {
      this.persistenceTimer = null;
      void this.flushPersistence();
    }, this.persistenceDelayMs);
  }

  private evictInactiveWorkspaces() {
    while (this.workspaces.size > this.maxRetainedWorkspaces) {
      const candidate = [...this.workspaces.entries()]
        .filter(([key]) => !this.visibleWorkspaceIds.has(key))
        .sort((left, right) => left[1].lastActivatedOrder - right[1].lastActivatedOrder)[0];
      if (!candidate) return;
      const [key, workspace] = candidate;
      this.persistWorkspace(workspace);
      this.workspaces.delete(key);
      workspace.view.webContents.close();
    }
  }
}

function scaleRectangle(bounds: Electron.Rectangle, scale: number): Electron.Rectangle {
  return {
    x: Math.round(bounds.x * scale),
    y: Math.round(bounds.y * scale),
    width: Math.max(1, Math.round(bounds.width * scale)),
    height: Math.max(1, Math.round(bounds.height * scale)),
  };
}

class FileBrowserWorkspaceSnapshotStore implements BrowserWorkspaceSnapshotStore {
  async read(): Promise<unknown> {
    return JSON.parse(await readFile(this.statePath(), "utf8")) as unknown;
  }

  async write(snapshots: BrowserWorkspaceSnapshot[]): Promise<void> {
    const statePath = this.statePath();
    const temporaryPath = `${statePath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(snapshots), "utf8");
    await rename(temporaryPath, statePath);
  }

  private statePath() {
    return path.join(app.getPath("userData"), STATE_FILE_NAME);
  }
}

function browserWebPreferences(): Electron.WebPreferences {
  return {
    contextIsolation: true,
    nodeIntegration: false,
    partition: BROWSER_PARTITION,
    sandbox: true,
  };
}

function normalizeUrl(rawUrl: string): string {
  try {
    return normalizeWorkspaceBrowserUrl(rawUrl);
  } catch {
    throw new Error("Only web URLs are supported in the Trace browser.");
  }
}

const isAllowedBrowserUrl = isWorkspaceBrowserUrl;

function permissionOrigin(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

function permissionDecisionKey(origin: string, permission: string): string {
  return `${origin}\n${permission}`;
}

function browserWorkspaceKey(sessionGroupId: string, browserId: string): string {
  return `${sessionGroupId}\n${browserId}`;
}

function permissionLabel(permission: string): string {
  const labels: Record<string, string> = {
    "clipboard-read": "your clipboard",
    fullscreen: "full screen",
    geolocation: "your location",
    media: "your camera or microphone",
    notifications: "notifications",
    pointerLock: "pointer lock",
  };
  return labels[permission] ?? permission;
}

async function closeDevTools(webContents: WebContents): Promise<void> {
  if (!webContents.isDevToolsOpened()) return;
  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      webContents.removeListener("devtools-closed", finish);
      resolve();
    };
    const timeout = setTimeout(finish, DEVTOOLS_CLOSE_TIMEOUT_MS);
    webContents.once("devtools-closed", finish);
    webContents.closeDevTools();
    if (!webContents.isDevToolsOpened()) finish();
  });
}

function isSnapshot(value: unknown): value is BrowserWorkspaceSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Record<string, unknown>;
  return (
    typeof snapshot.sessionGroupId === "string" &&
    (snapshot.browserId === undefined || typeof snapshot.browserId === "string") &&
    typeof snapshot.url === "string" &&
    isAllowedBrowserUrl(snapshot.url)
  );
}

function isFileNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as Error & { code?: string }).code === "ENOENT"
  );
}

function isAbortedNavigation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const navigationError = error as { code?: unknown; errno?: unknown };
  return navigationError.code === "ERR_ABORTED" || navigationError.errno === -3;
}
