import { app, BrowserWindow, dialog, ipcMain, powerMonitor, shell } from "electron";
import fs from "fs";
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

const REPO_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function isValidRepoId(value: unknown): value is string {
  return typeof value === "string" && REPO_ID_PATTERN.test(value);
}

function isValidLocalPath(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  const resolved = path.resolve(value);
  if (resolved !== path.normalize(value) && !path.isAbsolute(value)) return false;
  if (!path.isAbsolute(resolved)) return false;
  if (resolved.includes("\u0000")) return false;
  try {
    const stat = fs.statSync(resolved);
    return stat.isDirectory();
  } catch {
    return false;
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
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  const webUrl = process.env.TRACE_WEB_URL ?? `http://localhost:${3000 + portOffset}`;
  const webOrigin = new URL(webUrl).origin;

  // Apply a restrictive CSP defense-in-depth on top of the web app's own CSP.
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders };
    headers["Content-Security-Policy"] = [
      [
        "default-src 'self'",
        `connect-src 'self' ${webOrigin} ws: wss:`,
        "img-src 'self' data: https:",
        "style-src 'self' 'unsafe-inline'",
        "script-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'none'",
        "object-src 'none'",
      ].join("; "),
    ];
    callback({ responseHeaders: headers });
  });

  mainWindow.loadURL(webUrl);

  // Open external links in the user's default browser,
  // but allow the GitHub OAuth popup to open as an actual window
  // so window.opener.postMessage can relay the token back.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.includes("/auth/github")) {
      return { action: "allow" };
    }
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

ipcMain.handle("get-git-info", async (_event, folderPath: unknown) => {
  if (!isValidLocalPath(folderPath)) {
    return { error: "Invalid folder path" };
  }
  const resolved = path.resolve(folderPath as string);
  try {
    const [remoteResult, branchResult] = await Promise.all([
      execFileAsync("git", ["remote", "get-url", "origin"], { cwd: resolved }),
      execFileAsync("git", ["symbolic-ref", "--short", "HEAD"], { cwd: resolved }),
    ]);
    return {
      remoteUrl: remoteResult.stdout.trim(),
      defaultBranch: branchResult.stdout.trim() || "main",
      name: path.basename(resolved),
    };
  } catch {
    return { error: "Not a git repository or no remote origin configured." };
  }
});

ipcMain.handle("save-repo-path", async (_event, repoId: unknown, localPath: unknown) => {
  if (!isValidRepoId(repoId)) throw new Error("Invalid repoId");
  if (!isValidLocalPath(localPath)) throw new Error("Invalid localPath");
  const resolved = path.resolve(localPath as string);
  const repoConfig = await saveRepoPath(repoId, resolved);
  if (repoConfig.gitHooksEnabled) {
    await installOrRepairRepoHooks(resolved);
  }
  bridge.send({ type: "repo_linked", repoId });
  return repoConfig;
});

ipcMain.handle("get-repo-path", (_event, repoId: unknown) => {
  if (!isValidRepoId(repoId)) return null;
  return getRepoPath(repoId);
});

ipcMain.handle("get-repo-config", (_event, repoId: unknown) => {
  if (!isValidRepoId(repoId)) return null;
  return getRepoConfig(repoId);
});

ipcMain.handle(
  "set-repo-git-hooks-enabled",
  async (_event, repoId: unknown, enabled: unknown) => {
    if (!isValidRepoId(repoId)) throw new Error("Invalid repoId");
    if (typeof enabled !== "boolean") throw new Error("Invalid enabled flag");
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
  },
);

ipcMain.handle("get-repo-git-hook-status", async (_event, repoId: unknown) => {
  if (!isValidRepoId(repoId)) return null;
  const repoConfig = getRepoConfig(repoId);
  if (!repoConfig) return null;
  return getRepoHookStatus(repoConfig.path);
});

ipcMain.handle("repair-repo-git-hooks", async (_event, repoId: unknown) => {
  if (!isValidRepoId(repoId)) return null;
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
