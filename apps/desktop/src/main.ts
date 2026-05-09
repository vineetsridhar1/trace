import {
  app,
  BrowserWindow,
  desktopCapturer,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  powerMonitor,
  screen,
  shell,
  systemPreferences,
  type MenuItemConstructorOptions,
} from "electron";
import path from "path";
import { execFile } from "child_process";
import fs from "fs/promises";
import os from "os";
import { promisify } from "util";
import { BridgeClient, type BridgeConnectionStatus } from "./bridge.js";
import {
  getRepoConfig,
  getRepoPath,
  saveRepoPath,
  setBridgeLabel,
  setRepoGitHooksEnabled,
} from "./config.js";
import { disableRepoHooks, getRepoHookStatus, installOrRepairRepoHooks } from "./repo-hooks.js";
import { ensureHookRunnerEntrypoint } from "./hook-runtime.js";
import {
  getFeedbackOverlayHtml,
  type FeedbackDestination,
  type FeedbackScreenshot,
} from "./feedback-overlay.js";

const execFileAsync = promisify(execFile);

let mainWindow: BrowserWindow | null = null;
let feedbackOverlayWindow: BrowserWindow | null = null;
let feedbackDestination: FeedbackDestination | null = null;
let feedbackOverlayScreenshot: FeedbackScreenshot | null = null;
const portOffset = Number(process.env.TRACE_PORT || 0);
const serverUrl = process.env.TRACE_SERVER_URL ?? `http://localhost:${4000 + portOffset}`;
const appName = "Trace";
const appIconPath = path.join(__dirname, "../assets/icon.png");
const feedbackShortcut = process.env.TRACE_FEEDBACK_SHORTCUT ?? "CommandOrControl+Shift+F";
const macScreenRecordingSettingsUrl =
  "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture";

app.setName(appName);

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

async function publishFeedbackShortcut() {
  if (feedbackOverlayWindow && !feedbackOverlayWindow.isDestroyed()) {
    feedbackOverlayWindow.focus();
    return;
  }

  try {
    const screenshot = await captureFeedbackScreenshot();
    openFeedbackOverlay(screenshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to capture the current screen.";
    if (mainWindow && !mainWindow.isDestroyed()) {
      await dialog.showMessageBox(mainWindow, {
        type: "error",
        title: "Unable to Capture Feedback",
        message,
      });
    } else {
      console.error(`[main] feedback capture failed: ${message}`);
    }
  }
}

function registerFeedbackShortcut() {
  const registered = globalShortcut.register(feedbackShortcut, publishFeedbackShortcut);
  if (!registered) {
    console.warn(`[main] failed to register feedback shortcut: ${feedbackShortcut}`);
  }
}

function getScreenRecordingStatus() {
  if (process.platform !== "darwin") return "granted";
  return systemPreferences.getMediaAccessStatus("screen");
}

function getCurrentMacAppPath() {
  if (process.platform !== "darwin") return null;

  const appContentsIndex = process.execPath.indexOf(".app/Contents/MacOS/");
  if (appContentsIndex === -1) return null;

  return process.execPath.slice(0, appContentsIndex + ".app".length);
}

function getScreenRecordingPermissionMessage() {
  const permissionStatus = getScreenRecordingStatus();

  return [
    "Trace needs macOS Screen Recording permission to capture feedback screenshots.",
    "Enable it in System Settings > Privacy & Security > Screen Recording, then restart Trace.",
    `Current permission status: ${permissionStatus}.`,
  ].join(" ");
}

function getCaptureFailureMessage(error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);
  const permissionStatus = getScreenRecordingStatus();

  if (process.platform === "darwin" && permissionStatus !== "granted") {
    return getScreenRecordingPermissionMessage();
  }

  return `Unable to capture the current screen. ${detail}`;
}

async function promptForScreenRecordingAccess() {
  if (process.platform !== "darwin" || getScreenRecordingStatus() === "granted") return;

  if (getScreenRecordingStatus() === "not-determined") {
    try {
      await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: { width: 1, height: 1 },
      });
    } catch {
      // macOS may reject this immediately; the explicit settings prompt below handles it.
    }
  }

  if (getScreenRecordingStatus() === "granted") return;

  const appPath = getCurrentMacAppPath();
  const messageBoxOptions = {
    type: "info",
    buttons: appPath
      ? ["Open Settings", "Show App in Finder", "Cancel"]
      : ["Open Settings", "Cancel"],
    defaultId: 0,
    cancelId: appPath ? 2 : 1,
    title: "Allow Screen Recording",
    message: "Trace needs Screen Recording permission to capture feedback screenshots.",
    detail: [
      "macOS requires this permission before Trace can capture your screen for annotated feedback.",
      appPath
        ? "If Trace does not appear in the Screen Recording list, add the app shown in Finder."
        : null,
      "After enabling it, restart Trace.",
    ]
      .filter(Boolean)
      .join(" "),
  } satisfies Electron.MessageBoxOptions;
  const result = mainWindow
    ? await dialog.showMessageBox(mainWindow, messageBoxOptions)
    : await dialog.showMessageBox(messageBoxOptions);

  if (result.response === 0) {
    await shell.openExternal(macScreenRecordingSettingsUrl);
  } else if (result.response === 1 && appPath) {
    shell.showItemInFolder(appPath);
  }

  throw new Error(getScreenRecordingPermissionMessage());
}

async function captureFeedbackScreenshotWithScreencapture(display: Electron.Display) {
  const screenshotPath = path.join(os.tmpdir(), `trace-feedback-${process.pid}-${Date.now()}.png`);
  const captureBounds = [
    Math.round(display.bounds.x),
    Math.round(display.bounds.y),
    Math.round(display.bounds.width),
    Math.round(display.bounds.height),
  ].join(",");

  try {
    await execFileAsync("screencapture", ["-x", "-t", "png", "-R", captureBounds, screenshotPath]);
    const image = nativeImage.createFromPath(screenshotPath);
    if (image.isEmpty()) {
      throw new Error("screencapture returned an empty image");
    }

    const size = image.getSize();
    return {
      dataUrl: image.toDataURL(),
      width: size.width,
      height: size.height,
    };
  } finally {
    await fs.rm(screenshotPath, { force: true });
  }
}

async function captureFeedbackScreenshot() {
  const cursorPoint = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursorPoint);
  if (process.platform === "darwin") {
    try {
      return await captureFeedbackScreenshotWithScreencapture(display);
    } catch (error) {
      await promptForScreenRecordingAccess();
      throw new Error(getCaptureFailureMessage(error));
    }
  }

  const scaleFactor = display.scaleFactor || 1;
  const thumbnailSize = {
    width: Math.round(display.size.width * scaleFactor),
    height: Math.round(display.size.height * scaleFactor),
  };
  let sources: Electron.DesktopCapturerSource[];
  try {
    sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize });
  } catch (error) {
    await promptForScreenRecordingAccess();
    throw new Error(getCaptureFailureMessage(error));
  }
  const source =
    sources.find((item) => item.display_id === String(display.id)) ??
    sources.find((item) => item.id.includes(String(display.id))) ??
    sources[0];

  if (!source || source.thumbnail.isEmpty()) {
    await promptForScreenRecordingAccess();
    throw new Error(getCaptureFailureMessage("No usable screen source was returned"));
  }

  const image = source.thumbnail;
  const size = image.getSize();
  return {
    dataUrl: image.toDataURL(),
    width: size.width,
    height: size.height,
  };
}

function closeFeedbackOverlay() {
  if (!feedbackOverlayWindow || feedbackOverlayWindow.isDestroyed()) return;
  feedbackOverlayWindow.close();
  feedbackOverlayWindow = null;
  feedbackOverlayScreenshot = null;
}

function openFeedbackOverlay(screenshot: FeedbackScreenshot) {
  if (feedbackOverlayWindow && !feedbackOverlayWindow.isDestroyed()) {
    feedbackOverlayWindow.focus();
    return;
  }

  feedbackOverlayScreenshot = screenshot;
  const cursorPoint = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursorPoint);

  feedbackOverlayWindow = new BrowserWindow({
    ...display.bounds,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  feedbackOverlayWindow.setAlwaysOnTop(true, "screen-saver");
  if (process.platform === "darwin") {
    feedbackOverlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }

  feedbackOverlayWindow.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(getFeedbackOverlayHtml(feedbackDestination))}`,
  );

  feedbackOverlayWindow.on("closed", () => {
    feedbackOverlayWindow = null;
    feedbackOverlayScreenshot = null;
  });
}

function configureApplicationIdentity() {
  app.setName(appName);

  if (process.platform !== "darwin") return;

  app.dock?.setIcon(appIconPath);
  const menuTemplate: MenuItemConstructorOptions[] = [
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
    { role: "fileMenu" },
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
    icon: appIconPath,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const webUrl = process.env.TRACE_WEB_URL ?? `http://localhost:${3000 + portOffset}`;
  mainWindow.loadURL(webUrl);

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
ipcMain.handle("get-bridge-info", () => bridge.getInfo());
ipcMain.handle("capture-feedback-screenshot", () => captureFeedbackScreenshot());
ipcMain.handle("get-feedback-overlay-screenshot", () => feedbackOverlayScreenshot);
ipcMain.handle("close-feedback-overlay", () => {
  closeFeedbackOverlay();
  return true;
});
ipcMain.handle(
  "submit-feedback-overlay",
  (
    _event,
    payload: { message: string; screenshot: { dataUrl: string; width: number; height: number } },
  ) => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      throw new Error("Trace is not ready to send feedback");
    }

    mainWindow.webContents.send("feedback-overlay-submit", payload);
    closeFeedbackOverlay();
    return true;
  },
);
ipcMain.handle("set-feedback-destination", (_event, destination: FeedbackDestination | null) => {
  feedbackDestination = destination;
  return true;
});
ipcMain.handle("set-bridge-label", async (_event, label: string) => {
  await setBridgeLabel(label);
  bridge.updateLabel();
  return bridge.getInfo();
});
ipcMain.handle("set-bridge-auth-context", (_event, organizationId: string | null) => {
  bridge.setAuthContext(organizationId);
  return true;
});

app.whenReady().then(() => {
  configureApplicationIdentity();

  ensureHookRunnerEntrypoint({
    electronBinaryPath: process.execPath,
    runnerScriptPath: path.join(__dirname, "hook-runner.js"),
  });
  bridge.onStatusChange((status) => {
    publishBridgeStatus(status);
  });
  bridge.connect();
  createWindow();
  registerFeedbackShortcut();

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

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
