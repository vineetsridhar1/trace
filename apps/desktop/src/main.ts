import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  powerMonitor,
  shell,
  type MenuItemConstructorOptions,
} from "electron";
import path from "path";
import crypto from "crypto";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { setTimeout } from "node:timers";
import { makeUserNotifier, updateElectronApp, UpdateSourceType } from "update-electron-app";
import {
  BridgeClient,
  getGithubAuthToken,
  getGithubCliStatus,
  type BridgeConnectionStatus,
} from "./bridge.js";
import {
  getRepoConfig,
  getRepoPath,
  saveRepoPath,
  setBridgeLabel,
} from "./config.js";
import { getGitInfo } from "./git-info.js";
import { createLocalProjectOnDisk } from "./local-project.js";
import { hydrateLoginShellPath } from "./shell-path.js";
import { repairNodePtySpawnHelpers } from "./node-pty-spawn-helper.js";
import {
  movePackagedMacAppToApplicationsFolder,
  shouldMovePackagedMacAppToApplicationsFolder,
} from "./mac-install-location.js";
import { getCodingToolStatuses, installOrUpdateCodingTool } from "./coding-tools.js";
import { BrowserWorkspaceManager } from "./browser-workspaces.js";

let mainWindow: BrowserWindow | null = null;
const browserWorkspaces = new BrowserWorkspaceManager();
let browserStateFlushedForQuit = false;
const PROJECT_PARENT_SELECTION_TTL_MS = 10 * 60 * 1000;
const projectParentSelections = new Map<
  string,
  { path: string; timeout: ReturnType<typeof setTimeout> }
>();
type BuildConfig = {
  productionUrl?: string;
  macUpdateRepo?: string;
};

function loadBuildConfig(): BuildConfig {
  try {
    const raw = readFileSync(path.join(__dirname, "build-config.json"), "utf-8");
    return JSON.parse(raw) as BuildConfig;
  } catch {
    return {};
  }
}

const buildConfig = loadBuildConfig();
const portOffset = Number(process.env.TRACE_PORT || 0);
const localServerUrl = `http://localhost:${4000 + portOffset}`;
const localWebUrl = `http://localhost:${3000 + portOffset}`;
const defaultServerUrl =
  app.isPackaged && buildConfig.productionUrl ? buildConfig.productionUrl : localServerUrl;
const defaultWebUrl =
  app.isPackaged && buildConfig.productionUrl ? buildConfig.productionUrl : localWebUrl;
const serverUrl = process.env.TRACE_SERVER_URL ?? defaultServerUrl;
const appName = "Trace";
const appIconPath = path.join(__dirname, "../assets/icon.png");

app.setName(appName);
hydrateLoginShellPath();
if (app.isPackaged) {
  try {
    repairNodePtySpawnHelpers({ resourcesPath: process.resourcesPath });
  } catch (error) {
    console.warn("[main] failed to repair node-pty spawn helpers", error);
  }
}

async function getSessionCookieHeader(targetUrl: string): Promise<string | null> {
  if (!mainWindow || mainWindow.isDestroyed()) return null;

  const cookies = await mainWindow.webContents.session.cookies.get({ url: targetUrl });
  if (cookies.length === 0) return null;

  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

const bridge = new BridgeClient(serverUrl, getSessionCookieHeader);

function publishBridgeStatus(status: BridgeConnectionStatus) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("bridge-status", status);
}

function configureApplicationIdentity() {
  app.setName(appName);

  const isMac = process.platform === "darwin";
  if (isMac) app.dock?.setIcon(appIconPath);

  // Cmd/Ctrl+W closes the in-app tab (forwarded to the renderer); the window
  // close moves to Cmd/Ctrl+Shift+W. Built on every platform so the accelerator
  // override applies on Windows/Linux too, not just macOS.
  const fileSubmenu: MenuItemConstructorOptions[] = [
    {
      label: "Close Tab",
      accelerator: "CmdOrCtrl+W",
      click: () => mainWindow?.webContents.send("menu-command", "close-tab"),
    },
    { role: "close", label: "Close Window", accelerator: "CmdOrCtrl+Shift+W" },
  ];
  if (!isMac) {
    fileSubmenu.push({ type: "separator" }, { role: "quit", label: `Quit ${appName}` });
  }

  const menuTemplate: MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([
          {
            label: appName,
            submenu: [
              { role: "about", label: `About ${appName}` },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide", label: `Hide ${appName}` },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit", label: `Quit ${appName}` },
            ],
          },
        ] as MenuItemConstructorOptions[])
      : []),
    { label: "File", submenu: fileSubmenu },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
    { role: "help" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: "#18181b",
    ...(process.platform === "darwin"
      ? {
          titleBarStyle: "hiddenInset" as const,
          trafficLightPosition: { x: 18, y: 17 } as const,
        }
      : {}),
    icon: appIconPath,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const webUrl = process.env.TRACE_WEB_URL ?? defaultWebUrl;
  mainWindow.loadURL(webUrl);
  browserWorkspaces.setWindow(mainWindow);

  // Open external links in the user's default browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    // Allow navigation within the app, open everything else externally
    if (!url.startsWith(webUrl)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // Forward mouse back/forward buttons as browser-style navigation
  // On macOS, use swipe events; on Windows/Linux, use app-command
  mainWindow.on("app-command", (_event, command) => {
    if (command === "browser-backward") {
      mainWindow?.webContents.executeJavaScript("history.back()");
    } else if (command === "browser-forward") {
      mainWindow?.webContents.executeJavaScript("history.forward()");
    }
  });

  // Native right-click context menu with spellcheck suggestions and edit actions.
  // Electron enables the spell checker by default but does not render a context
  // menu for it — we have to build one from the context-menu event params.
  mainWindow.webContents.on("context-menu", (_event, params) => {
    const template: MenuItemConstructorOptions[] = [];

    if (params.misspelledWord) {
      for (const suggestion of params.dictionarySuggestions) {
        template.push({
          label: suggestion,
          click: () => mainWindow?.webContents.replaceMisspelling(suggestion),
        });
      }
      if (params.dictionarySuggestions.length === 0) {
        template.push({ label: "No suggestions", enabled: false });
      }
      template.push({
        label: "Add to Dictionary",
        click: () =>
          mainWindow?.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
      });
      template.push({ type: "separator" });
    }

    if (params.isEditable) {
      template.push(
        { role: "cut", enabled: params.editFlags.canCut },
        { role: "copy", enabled: params.editFlags.canCopy },
        { role: "paste", enabled: params.editFlags.canPaste },
        { role: "selectAll" },
      );
    } else if (params.selectionText) {
      template.push({ role: "copy", enabled: params.editFlags.canCopy });
    }

    if (template.length > 0) {
      Menu.buildFromTemplate(template).popup({ window: mainWindow ?? undefined });
    }
  });

  mainWindow.on("closed", () => {
    browserWorkspaces.setWindow(null);
    mainWindow = null;
  });
}

function configureMacAutoUpdates() {
  if (!app.isPackaged || process.platform !== "darwin") return;
  if (!buildConfig.macUpdateRepo) return;

  updateElectronApp({
    updateSource: {
      type: UpdateSourceType.ElectronPublicUpdateService,
      repo: buildConfig.macUpdateRepo,
    },
    updateInterval: "30 minutes",
    onNotifyUser: makeUserNotifier({
      title: "Trace Update Ready",
      detail: "A new version of Trace has been downloaded. Restart to apply it.",
      restartButtonText: "Restart Trace",
      laterButtonText: "Later",
    }),
  });
}

ipcMain.handle("pick-folder", async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle("get-git-info", async (_event, folderPath: string) => {
  return getGitInfo(folderPath);
});

ipcMain.handle("pick-project-parent-folder", async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
  });
  if (result.canceled) return null;

  const token = crypto.randomUUID();
  const folderPath = result.filePaths[0];
  const timeout = setTimeout(() => {
    projectParentSelections.delete(token);
  }, PROJECT_PARENT_SELECTION_TTL_MS);
  timeout.unref?.();
  projectParentSelections.set(token, { path: folderPath, timeout });
  return { token, path: folderPath };
});

ipcMain.handle(
  "create-local-project",
  async (_event, input: { name?: string; parentToken?: string }) => {
    const parentToken = input.parentToken;
    const selection = parentToken ? projectParentSelections.get(parentToken) : null;
    if (parentToken) {
      if (selection) clearTimeout(selection.timeout);
      projectParentSelections.delete(parentToken);
    }
    try {
      return await createLocalProjectOnDisk({
        name: input.name,
        parentPath: selection?.path ?? "",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { error: message };
    }
  },
);

ipcMain.handle("save-repo-path", async (_event, repoId: string, localPath: string) => {
  const repoConfig = await saveRepoPath(repoId, localPath);
  // Notify the server that this bridge now has this repo registered
  bridge.send({ type: "repo_linked", repoId });
  return repoConfig;
});

ipcMain.handle("get-repo-path", (_event, repoId: string) => {
  return getRepoPath(repoId);
});

ipcMain.handle("get-repo-config", (_event, repoId: string) => {
  return getRepoConfig(repoId);
});

ipcMain.handle("get-github-cli-status", async () => {
  return getGithubCliStatus();
});

ipcMain.handle("get-github-auth-token", async () => {
  return getGithubAuthToken();
});

ipcMain.handle("login-codex-with-chatgpt", async () => {
  const codexHome = await mkdtemp(path.join(tmpdir(), "trace-codex-login-"));
  try {
    await writeFile(path.join(codexHome, "config.toml"), 'cli_auth_credentials_store = "file"\n', {
      mode: 0o600,
    });
    const exitCode = await new Promise<number | null>((resolve, reject) => {
      const child = spawn("codex", ["login"], {
        env: { ...process.env, CODEX_HOME: codexHome },
        stdio: "pipe",
      });
      child.once("error", reject);
      child.once("close", resolve);
    });
    if (exitCode !== 0) throw new Error("Codex login was cancelled or failed.");
    return await readFile(path.join(codexHome, "auth.json"), "utf8");
  } finally {
    await rm(codexHome, { force: true, recursive: true });
  }
});

ipcMain.handle("get-coding-tool-statuses", () => getCodingToolStatuses());
ipcMain.handle("install-or-update-coding-tool", async (_event, toolId: string) => {
  const status = await installOrUpdateCodingTool(toolId);
  bridge.refreshCapabilities();
  return status;
});

ipcMain.handle("get-bridge-status", () => bridge.getStatus());
ipcMain.handle("get-bridge-info", () => bridge.getInfo());
ipcMain.handle("set-bridge-label", async (_event, label: string) => {
  await setBridgeLabel(label);
  bridge.updateLabel();
  return bridge.getInfo();
});
ipcMain.handle("set-bridge-auth-context", (_event, organizationId: string | null) => {
  bridge.setAuthContext(organizationId);
  return true;
});
ipcMain.handle("browser-activate", (_event, input: { sessionGroupId: string; browserId: string }) =>
  browserWorkspaces.activate(input.sessionGroupId, input.browserId),
);
ipcMain.handle("browser-hide", (_event, input: { sessionGroupId: string; browserId: string }) =>
  browserWorkspaces.hide(input.sessionGroupId, input.browserId),
);
ipcMain.handle("browser-destroy", (_event, input: { sessionGroupId: string; browserId: string }) =>
  browserWorkspaces.destroy(input.sessionGroupId, input.browserId),
);
ipcMain.handle(
  "browser-set-bounds",
  (_event, input: { sessionGroupId: string; browserId: string; bounds: Electron.Rectangle }) => {
    browserWorkspaces.setBounds(input.sessionGroupId, input.browserId, input.bounds);
  },
);
ipcMain.handle(
  "browser-set-overlay-hidden",
  (_event, input: { sessionGroupId: string; browserId: string; hidden: boolean }) => {
    browserWorkspaces.setOverlayHidden(input.sessionGroupId, input.browserId, input.hidden);
  },
);
ipcMain.handle("browser-navigate", (_event, input: { sessionGroupId: string; browserId: string; url: string }) =>
  browserWorkspaces.navigate(input.sessionGroupId, input.browserId, input.url),
);
ipcMain.handle("browser-back", (_event, input: { sessionGroupId: string; browserId: string }) =>
  browserWorkspaces.goBack(input.sessionGroupId, input.browserId),
);
ipcMain.handle("browser-forward", (_event, input: { sessionGroupId: string; browserId: string }) =>
  browserWorkspaces.goForward(input.sessionGroupId, input.browserId),
);
ipcMain.handle("browser-reload", (_event, input: { sessionGroupId: string; browserId: string }) =>
  browserWorkspaces.reload(input.sessionGroupId, input.browserId),
);
ipcMain.handle("browser-toggle-devtools", (_event, input: { sessionGroupId: string; browserId: string }) =>
  browserWorkspaces.toggleDevTools(input.sessionGroupId, input.browserId),
);
// Cmd+W with no in-app tab to close falls back to closing the window.
ipcMain.on("close-window", () => mainWindow?.close());

app.whenReady().then(() => {
  if (shouldMovePackagedMacAppToApplicationsFolder(app, process.execPath)) {
    const response = dialog.showMessageBoxSync({
      type: "info",
      buttons: ["Move to Applications", "Continue Here"],
      defaultId: 0,
      cancelId: 1,
      title: "Move Trace to Applications",
      message: "Move Trace to Applications?",
      detail:
        "macOS is running Trace from a temporary App Translocation location. Moving Trace to Applications prevents local terminal and bridge launch failures.",
    });
    if (response === 0 && movePackagedMacAppToApplicationsFolder(app, process.execPath)) {
      return;
    }
  }

  configureApplicationIdentity();
  configureMacAutoUpdates();

  bridge.onStatusChange((status) => {
    publishBridgeStatus(status);
  });
  bridge.connect();
  createWindow();

  // After sleep/wake the WebSocket is often dead but no close event fires.
  // Force an immediate reconnect so the user doesn't have to restart the app.
  powerMonitor.on("resume", () => {
    console.log("[main] system resumed from sleep, forcing bridge reconnect");
    bridge.forceReconnect();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    bridge.disconnect();
    app.quit();
  }
});

app.on("before-quit", (event) => {
  if (browserStateFlushedForQuit) return;
  event.preventDefault();
  void browserWorkspaces.flushPersistence().finally(() => {
    browserStateFlushedForQuit = true;
    app.quit();
  });
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});
