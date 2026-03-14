import { app, BrowserWindow } from "electron";
import path from "path";
import { BridgeClient } from "./bridge.js";

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

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

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
