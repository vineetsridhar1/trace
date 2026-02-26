import { app, BrowserWindow, shell } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';

import { registerIpcHandlers, setMainWindow } from './main/ipc';
import { setWorktreeBaseFn, runStateByMessageId, stopWatchdog } from './main/watchdog';
import { killAllPtys } from './main/pty';
import {
  setWorktreeBase,
  getWorktreeBase,
  runningProcesses,
  suppressSyntheticStopFor,
} from './main/worktree';

if (started) {
  app.quit();
}

setWorktreeBaseFn(getWorktreeBase);
registerIpcHandlers();

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1600,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  setMainWindow(mainWindow);

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  mainWindow.webContents.openDevTools();

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
};

app.on('ready', () => {
  const rawEnv = process.env.TRACE_SERVER_URL;
  const backendUrl = rawEnv ? (rawEnv.startsWith('http') ? rawEnv : `http://localhost:${rawEnv}`) : 'http://localhost:3100';
  console.log(`[Trace] Backend server URL: ${backendUrl}`);
  console.log(`[Trace] TRACE_SERVER_URL env: ${rawEnv ?? '(not set, using default)'}`);
  setWorktreeBase(path.join(app.getPath('userData'), 'worktrees'));
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  killAllPtys();
  for (const [id, proc] of runningProcesses) {
    if (!proc.killed) {
      suppressSyntheticStopFor.add(id);
      stopWatchdog(id, 'app-before-quit');
      runStateByMessageId.delete(id);
      proc.kill('SIGTERM');
      console.log(`Killed claude process for ${id.slice(0, 8)}`);
    }
  }
  runningProcesses.clear();
  runStateByMessageId.clear();
});
