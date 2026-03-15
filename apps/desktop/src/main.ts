import { app, BrowserWindow, dialog, ipcMain } from "electron";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { BridgeClient } from "./bridge.js";
import { readConfig, writeConfig } from "./config.js";

const execFileAsync = promisify(execFile);

let mainWindow: BrowserWindow | null = null;
const serverUrl = process.env.TRACE_SERVER_URL ?? "http://localhost:4000";
const bridge = new BridgeClient(serverUrl);

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

  const webUrl = process.env.TRACE_WEB_URL ?? "http://localhost:3000";
  mainWindow.loadURL(webUrl);

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

ipcMain.handle("save-repo-path", (_event, repoId: string, localPath: string) => {
  const config = readConfig();
  config.repos[repoId] = localPath;
  writeConfig(config);
});

ipcMain.handle("get-repo-path", (_event, repoId: string) => {
  const config = readConfig();
  return config.repos[repoId] ?? null;
});

app.whenReady().then(() => {
  bridge.connect();
  createWindow();
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
