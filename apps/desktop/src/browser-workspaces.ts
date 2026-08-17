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
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  loading: boolean;
  devToolsOpen: boolean;
  suspensionState: "active" | "frozen" | "muted";
};

export type BrowserWorkspaceSnapshot = Pick<BrowserWorkspaceState, "sessionGroupId" | "url">;

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
  view: WebContentsView;
  state: BrowserWorkspaceState;
  lastActivatedOrder: number;
  reopenDevToolsOnActivate: boolean;
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
  private visibleSessionGroupId: string | null = null;
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

  async activate(sessionGroupId: string): Promise<BrowserWorkspaceState> {
    await this.loadSnapshots();
    if (this.visibleSessionGroupId && this.visibleSessionGroupId !== sessionGroupId) {
      await this.hide(this.visibleSessionGroupId);
    }

    const workspace = this.getOrCreate(sessionGroupId);
    if (this.window && !this.window.isDestroyed()) {
      this.window.contentView.addChildView(workspace.view);
    }
    this.visibleSessionGroupId = sessionGroupId;
    workspace.lastActivatedOrder = ++this.activationOrder;
    try {
      workspace.state.suspensionState = await this.setFrozen(workspace, false);
    } catch (error) {
      if (this.window && !this.window.isDestroyed()) {
        this.window.contentView.removeChildView(workspace.view);
      }
      this.visibleSessionGroupId = null;
      throw error;
    }
    this.evictInactiveWorkspaces();
    this.updateState(workspace);
    return workspace.state;
  }

  async hide(sessionGroupId: string): Promise<void> {
    const workspace = this.workspaces.get(sessionGroupId);
    if (!workspace || this.visibleSessionGroupId !== sessionGroupId) return;

    if (this.window && !this.window.isDestroyed()) {
      this.window.contentView.removeChildView(workspace.view);
    }
    this.visibleSessionGroupId = null;
    workspace.state.suspensionState = await this.setFrozen(workspace, true);
    this.persistWorkspace(workspace);
    await this.flushPersistence();
    this.publish(workspace);
  }

  setBounds(sessionGroupId: string, bounds: Electron.Rectangle) {
    if (this.visibleSessionGroupId !== sessionGroupId) return;
    const workspace = this.workspaces.get(sessionGroupId);
    if (!workspace) return;
    workspace.view.setBounds(bounds);
  }

  async navigate(sessionGroupId: string, rawUrl: string): Promise<BrowserWorkspaceState> {
    const workspace = this.requireActiveWorkspace(sessionGroupId);
    await workspace.view.webContents.loadURL(normalizeUrl(rawUrl));
    return workspace.state;
  }

  async goBack(sessionGroupId: string): Promise<BrowserWorkspaceState> {
    const workspace = this.requireActiveWorkspace(sessionGroupId);
    if (workspace.view.webContents.navigationHistory.canGoBack()) {
      workspace.view.webContents.navigationHistory.goBack();
    }
    return workspace.state;
  }

  async goForward(sessionGroupId: string): Promise<BrowserWorkspaceState> {
    const workspace = this.requireActiveWorkspace(sessionGroupId);
    if (workspace.view.webContents.navigationHistory.canGoForward()) {
      workspace.view.webContents.navigationHistory.goForward();
    }
    return workspace.state;
  }

  async reload(sessionGroupId: string): Promise<BrowserWorkspaceState> {
    const workspace = this.requireActiveWorkspace(sessionGroupId);
    workspace.view.webContents.reload();
    return workspace.state;
  }

  async toggleDevTools(sessionGroupId: string): Promise<BrowserWorkspaceState> {
    const workspace = this.requireActiveWorkspace(sessionGroupId);
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

  private requireActiveWorkspace(sessionGroupId: string): BrowserWorkspace {
    if (this.visibleSessionGroupId !== sessionGroupId) {
      throw new Error("Browser workspace is not active.");
    }
    const workspace = this.workspaces.get(sessionGroupId);
    if (!workspace) throw new Error("Browser workspace was not created.");
    return workspace;
  }

  private getOrCreate(sessionGroupId: string): BrowserWorkspace {
    const existing = this.workspaces.get(sessionGroupId);
    if (existing) return existing;

    const snapshot = this.snapshots.get(sessionGroupId);
    const view = new WebContentsView({
      webPreferences: browserWebPreferences(),
    });
    const workspace: BrowserWorkspace = {
      view,
      state: {
        sessionGroupId,
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
    };
    this.workspaces.set(sessionGroupId, workspace);
    this.configureSession(view.webContents.session);
    this.bindWorkspaceEvents(workspace);
    this.configureWindowOpening(view.webContents);
    void view.webContents.loadURL(workspace.state.url).catch((error: unknown) => {
      console.warn("[browser] failed to restore browser workspace", error);
    });
    return workspace;
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
      if (this.workspaces.get(workspace.state.sessionGroupId) === workspace) {
        this.workspaces.delete(workspace.state.sessionGroupId);
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

  private configureWindowOpening(webContents: WebContents) {
    webContents.setWindowOpenHandler(({ url }) => this.windowOpenResponse(url));
    webContents.on("did-create-window", (popup) => {
      this.configureSession(popup.webContents.session);
      this.configureWindowOpening(popup.webContents);
      this.bindContextMenu(popup.webContents);
    });
  }

  private windowOpenResponse(url: string): WindowOpenHandlerResponse {
    if (!isAllowedBrowserUrl(url)) return { action: "deny" };
    return {
      action: "allow",
      overrideBrowserWindowOptions: {
        width: 1000,
        height: 720,
        autoHideMenuBar: true,
        backgroundColor: "#18181b",
        webPreferences: browserWebPreferences(),
      },
    };
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
        this.snapshots.set(snapshot.sessionGroupId, snapshot);
      }
    } catch (error) {
      if (!isFileNotFoundError(error)) {
        console.warn("[browser] failed to restore browser workspaces", error);
      }
    }
  }

  private persistWorkspace(workspace: BrowserWorkspace) {
    this.snapshots.set(workspace.state.sessionGroupId, {
      sessionGroupId: workspace.state.sessionGroupId,
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
        .filter(([sessionGroupId]) => sessionGroupId !== this.visibleSessionGroupId)
        .sort((left, right) => left[1].lastActivatedOrder - right[1].lastActivatedOrder)[0];
      if (!candidate) return;
      const [sessionGroupId, workspace] = candidate;
      this.persistWorkspace(workspace);
      this.workspaces.delete(sessionGroupId);
      workspace.view.webContents.close();
    }
  }
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
  const trimmed = rawUrl.trim();
  const candidate = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(candidate);
  if (!isAllowedBrowserUrl(url.toString())) {
    throw new Error("Only web URLs are supported in the Trace browser.");
  }
  return url.toString();
}

function isAllowedBrowserUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "http:" || url.protocol === "https:" || url.href === "about:blank";
  } catch {
    return false;
  }
}

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
  return typeof snapshot.sessionGroupId === "string" && typeof snapshot.url === "string";
}

function isFileNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as Error & { code?: string }).code === "ENOENT"
  );
}
