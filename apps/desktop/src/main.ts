import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'node:path';
import os from 'node:os';
import started from 'electron-squirrel-startup';

import { registerIpcHandlers, setMainWindow } from './main/ipc';
import { resolveServerUrl } from './main/ipc/shared';
import { setWorktreeBaseFn, runStateByWorkspaceId, stopWatchdog } from './main/watchdog';
import { killAllPtys } from './main/pty';
import {
  setWorktreeBase,
  getWorktreeBase,
  runningProcesses,
  suppressSyntheticStopFor,
} from './main/worktree';
import { InstanceConnection, getOrCreateInstanceId, setAuthToken } from './main/instanceConnection';
import { handleRelayCommand } from './main/instanceCommandHandler';
import { registerAgentRelayActions } from './main/ipc/agentHandlers';
import { registerWorktreeRelayActions } from './main/ipc/worktreeHandlers';
import { registerGitRelayActions } from './main/ipc/gitHandlers';
import { registerGithubRelayActions } from './main/ipc/githubHandlers';
import { registerRepoRelayActions } from './main/ipc/repoHandlers';
import { registerMiscRelayActions } from './main/ipc/miscHandlers';

if (started) {
  app.quit();
}

setWorktreeBaseFn(getWorktreeBase);
registerIpcHandlers();

// Register relay actions for webapp → Electron communication
registerAgentRelayActions();
registerWorktreeRelayActions();
registerGitRelayActions();
registerGithubRelayActions();
registerRepoRelayActions();
registerMiscRelayActions();

let instanceConnection: InstanceConnection | null = null;

ipcMain.handle('set-instance-auth', (_event, token: string, serverId: string) => {
  if (instanceConnection) {
    instanceConnection.disconnect();
  }

  setAuthToken(token, serverId);

  const httpUrl = resolveServerUrl();
  const serverUrl = httpUrl.replace(/^http/, 'ws');

  instanceConnection = new InstanceConnection({
    serverUrl,
    token,
    instanceId: getOrCreateInstanceId(),
    serverId,
    instanceName: os.hostname(),
    onCommand: handleRelayCommand,
  });
  instanceConnection.connect();
});

ipcMain.handle('clear-instance-auth', () => {
  if (instanceConnection) {
    instanceConnection.disconnect();
    instanceConnection = null;
  }
  setAuthToken(null, null);
});

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1600,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true,
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

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.webContents.openDevTools();
  }

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

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key.toLowerCase() === 'w' && input.meta && !input.shift && !input.alt) {
      event.preventDefault();
      mainWindow.webContents.send('close-terminal-tab');
    }
  });
};

app.on('ready', () => {
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
  instanceConnection?.disconnect();
  instanceConnection = null;
  killAllPtys();
  for (const [id, proc] of runningProcesses) {
    if (!proc.killed) {
      suppressSyntheticStopFor.add(id);
      stopWatchdog(id, 'app-before-quit');
      runStateByWorkspaceId.delete(id);
      proc.kill('SIGTERM');
    }
  }
  runningProcesses.clear();
  runStateByWorkspaceId.clear();
});
