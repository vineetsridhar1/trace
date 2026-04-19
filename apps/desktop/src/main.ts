import { app, BrowserWindow, dialog, ipcMain, powerMonitor, shell } from "electron";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { BridgeClient, type BridgeConnectionStatus } from "./bridge.js";
import { getRepoConfig, getRepoPath, saveRepoPath, setRepoGitHooksEnabled } from "./config.js";
import { disableRepoHooks, getRepoHookStatus, installOrRepairRepoHooks } from "./repo-hooks.js";
import { ensureHookRunnerEntrypoint } from "./hook-runtime.js";

const execFileAsync = promisify(execFile);

let mainWindow: BrowserWindow | null = null;
const portOffset = Number(process.env.TRACE_PORT || 0);
const serverUrl = process.env.TRACE_SERVER_URL ?? `http://localhost:${4000 + portOffset}`;
const bridge = new BridgeClient(serverUrl);

const PROTOCOL = "trace";
let pendingAuthToken: string | null = null;

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient(PROTOCOL);
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", (_e, argv) => {
    const url = argv.find((a) => a.startsWith(`${PROTOCOL}://`));
    if (url) handleDeepLink(url);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

app.on("open-url", (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

function handleDeepLink(url: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return;
  }
  if (parsed.protocol !== `${PROTOCOL}:`) return;
  if (parsed.hostname !== "auth" || parsed.pathname !== "/callback") return;
  const token = parsed.searchParams.get("token");
  if (!token) return;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("auth:token", token);
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  } else {
    pendingAuthToken = token;
  }
}

function publishBridgeStatus(status: BridgeConnectionStatus) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("bridge-status", status);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const webUrl = process.env.TRACE_WEB_URL ?? `http://localhost:${3000 + portOffset}`;
  mainWindow.loadURL(webUrl);

  // Open every external URL in the user's default browser, including the
  // GitHub OAuth login URL — its callback redirects to trace://auth/callback,
  // which we handle via app.on("open-url") / "second-instance".
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.webContents.once("did-finish-load", () => {
    if (pendingAuthToken && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("auth:token", pendingAuthToken);
      pendingAuthToken = null;
    }
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

  mainWindow.on("closed", () => {
    mainWindow = null;
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
  try {
    const [remoteResult, branchResult] = await Promise.all([
      execFileAsync("git", ["remote", "get-url", "origin"], { cwd: folderPath }),
      execFileAsync("git", ["symbolic-ref", "--short", "HEAD"], { cwd: folderPath }),
    ]);
    return {
      remoteUrl: remoteResult.stdout.trim(),
      defaultBranch: branchResult.stdout.trim() || "main",
      name: path.basename(folderPath),
    };
  } catch {
    return { error: "Not a git repository or no remote origin configured." };
  }
});

ipcMain.handle("save-repo-path", async (_event, repoId: string, localPath: string) => {
  const repoConfig = await saveRepoPath(repoId, localPath);
  if (repoConfig.gitHooksEnabled) {
    await installOrRepairRepoHooks(localPath);
  }
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

ipcMain.handle("set-repo-git-hooks-enabled", async (_event, repoId: string, enabled: boolean) => {
  const repoConfig = await setRepoGitHooksEnabled(repoId, enabled);
  if (!repoConfig) {
    return { config: null, status: null };
  }

  const status = enabled
    ? await installOrRepairRepoHooks(repoConfig.path)
    : await disableRepoHooks(repoConfig.path);

  return {
    config: repoConfig,
    status,
  };
});

ipcMain.handle("get-repo-git-hook-status", async (_event, repoId: string) => {
  const repoConfig = getRepoConfig(repoId);
  if (!repoConfig) return null;
  return getRepoHookStatus(repoConfig.path);
});

ipcMain.handle("repair-repo-git-hooks", async (_event, repoId: string) => {
  const repoConfig = getRepoConfig(repoId);
  if (!repoConfig) return null;
  return installOrRepairRepoHooks(repoConfig.path);
});

ipcMain.handle("get-bridge-status", () => bridge.getStatus());
ipcMain.handle(
  "set-bridge-auth-context",
  (_event, token: string | null, organizationId: string | null) => {
    bridge.setAuthContext(token, organizationId);
    return true;
  },
);

app.whenReady().then(() => {
  ensureHookRunnerEntrypoint({
    electronBinaryPath: process.execPath,
    runnerScriptPath: path.join(__dirname, "hook-runner.js"),
  });
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

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});
