import {
  app,
  BrowserWindow,
  clipboard,
  Menu,
  type MenuItemConstructorOptions,
  WebContentsView,
} from "electron";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type BrowserWorkspaceState = {
  sessionGroupId: string;
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  loading: boolean;
  devToolsOpen: boolean;
};

type BrowserWorkspace = {
  view: WebContentsView;
  state: BrowserWorkspaceState;
};

type BrowserWorkspaceSnapshot = Pick<BrowserWorkspaceState, "sessionGroupId" | "url">;

const BROWSER_PARTITION = "persist:trace-browser";
const STATE_FILE_NAME = "browser-workspaces.json";

/**
 * Owns the native Chromium pages used by session-group browsers. React can
 * mount and unmount freely; keeping a workspace here keeps its page process,
 * history, media position, and DevTools target alive.
 */
export class BrowserWorkspaceManager {
  private readonly workspaces = new Map<string, BrowserWorkspace>();
  private readonly snapshots = new Map<string, BrowserWorkspaceSnapshot>();
  private window: BrowserWindow | null = null;
  private visibleSessionGroupId: string | null = null;
  private loadStatePromise: Promise<void> | null = null;

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
    await this.setFrozen(workspace.view, false);
    this.publish(workspace);
    return workspace.state;
  }

  async hide(sessionGroupId: string): Promise<void> {
    const workspace = this.workspaces.get(sessionGroupId);
    if (!workspace) return;

    const wasVisible = this.visibleSessionGroupId === sessionGroupId;
    if (wasVisible && this.window && !this.window.isDestroyed()) {
      this.window.contentView.removeChildView(workspace.view);
    }
    if (wasVisible) this.visibleSessionGroupId = null;
    await this.setFrozen(workspace.view, true);
    this.persistWorkspace(workspace);
  }

  setBounds(sessionGroupId: string, bounds: Electron.Rectangle) {
    if (this.visibleSessionGroupId !== sessionGroupId) return;
    const workspace = this.workspaces.get(sessionGroupId);
    if (!workspace) return;
    workspace.view.setBounds(bounds);
  }

  async navigate(sessionGroupId: string, rawUrl: string): Promise<BrowserWorkspaceState> {
    const workspace = await this.requireWorkspace(sessionGroupId);
    const url = normalizeUrl(rawUrl);
    await workspace.view.webContents.loadURL(url);
    return workspace.state;
  }

  async goBack(sessionGroupId: string): Promise<BrowserWorkspaceState> {
    const workspace = await this.requireWorkspace(sessionGroupId);
    if (workspace.view.webContents.navigationHistory.canGoBack()) {
      workspace.view.webContents.navigationHistory.goBack();
    }
    return workspace.state;
  }

  async goForward(sessionGroupId: string): Promise<BrowserWorkspaceState> {
    const workspace = await this.requireWorkspace(sessionGroupId);
    if (workspace.view.webContents.navigationHistory.canGoForward()) {
      workspace.view.webContents.navigationHistory.goForward();
    }
    return workspace.state;
  }

  async reload(sessionGroupId: string): Promise<BrowserWorkspaceState> {
    const workspace = await this.requireWorkspace(sessionGroupId);
    workspace.view.webContents.reload();
    return workspace.state;
  }

  async toggleDevTools(sessionGroupId: string): Promise<BrowserWorkspaceState> {
    const workspace = await this.requireWorkspace(sessionGroupId);
    const contents = workspace.view.webContents;
    if (contents.isDevToolsOpened()) contents.closeDevTools();
    else contents.openDevTools({ mode: "right", title: "Trace Browser DevTools" });
    this.updateState(workspace);
    return workspace.state;
  }

  private async requireWorkspace(sessionGroupId: string): Promise<BrowserWorkspace> {
    await this.activate(sessionGroupId);
    const workspace = this.workspaces.get(sessionGroupId);
    if (!workspace) throw new Error("Browser workspace was not created.");
    return workspace;
  }

  private getOrCreate(sessionGroupId: string): BrowserWorkspace {
    const existing = this.workspaces.get(sessionGroupId);
    if (existing) return existing;

    const snapshot = this.snapshots.get(sessionGroupId);
    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        partition: BROWSER_PARTITION,
        sandbox: true,
      },
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
      },
    };
    this.workspaces.set(sessionGroupId, workspace);
    this.bindWorkspaceEvents(workspace);
    view.webContents.setWindowOpenHandler(({ url }) => {
      // New browser windows must stay inside the workspace and never inherit
      // Trace's privileged BrowserWindow configuration.
      void this.navigate(sessionGroupId, url).catch(() => undefined);
      return { action: "deny" };
    });
    void view.webContents.loadURL(workspace.state.url);
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
    webContents.on("context-menu", (_event, params) => {
      const template: MenuItemConstructorOptions[] = [
        {
          label: "Back",
          enabled: webContents.navigationHistory.canGoBack(),
          click: () => void this.goBack(workspace.state.sessionGroupId),
        },
        {
          label: "Forward",
          enabled: webContents.navigationHistory.canGoForward(),
          click: () => void this.goForward(workspace.state.sessionGroupId),
        },
        { label: "Reload", click: () => webContents.reload() },
      ];

      if (params.linkURL) {
        template.push(
          { type: "separator" },
          {
            label: "Open Link",
            click: () =>
              void this.navigate(workspace.state.sessionGroupId, params.linkURL).catch(
                () => undefined,
              ),
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
    webContents.on("destroyed", () => this.workspaces.delete(workspace.state.sessionGroupId));
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

  private async setFrozen(view: WebContentsView, frozen: boolean) {
    const { webContents } = view;
    try {
      if (!webContents.debugger.isAttached()) webContents.debugger.attach("1.3");
      await webContents.debugger.sendCommand("Page.setWebLifecycleState", {
        state: frozen ? "frozen" : "active",
      });
    } catch {
      // The lifecycle protocol is experimental. Muting remains a safe fallback
      // if Chromium rejects it for a particular page.
    }
    webContents.setAudioMuted(frozen);
  }

  private async loadSnapshots() {
    if (!this.loadStatePromise) this.loadStatePromise = this.readSnapshots();
    await this.loadStatePromise;
  }

  private async readSnapshots() {
    try {
      const raw = await readFile(this.statePath(), "utf8");
      const snapshots: unknown = JSON.parse(raw);
      if (!Array.isArray(snapshots)) return;
      for (const snapshot of snapshots) {
        if (!isSnapshot(snapshot)) continue;
        this.snapshots.set(snapshot.sessionGroupId, snapshot);
      }
    } catch {
      // No saved workspace is a normal first-run state.
    }
  }

  private persistWorkspace(workspace: BrowserWorkspace) {
    this.snapshots.set(workspace.state.sessionGroupId, {
      sessionGroupId: workspace.state.sessionGroupId,
      url: workspace.state.url,
    });
    void writeFile(this.statePath(), JSON.stringify([...this.snapshots.values()]), "utf8");
  }

  private statePath() {
    return path.join(app.getPath("userData"), STATE_FILE_NAME);
  }
}

function normalizeUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  const candidate = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(candidate);
  if (!new Set(["http:", "https:", "about:"]).has(url.protocol)) {
    throw new Error("Only web URLs are supported in the Trace browser.");
  }
  return url.toString();
}

function isSnapshot(value: unknown): value is BrowserWorkspaceSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Record<string, unknown>;
  return typeof snapshot.sessionGroupId === "string" && typeof snapshot.url === "string";
}
