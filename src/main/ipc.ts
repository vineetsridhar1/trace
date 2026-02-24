import { ipcMain, dialog, type BrowserWindow } from 'electron';
import { spawnClaude } from './claude';
import { checkWorktreeExists, deleteWorktree, mergeWorktree, getWorktreePath, stopClaudeProcess } from './worktree';
import { resetWatchdog, stopWatchdog, markHookStopReceived } from './watchdog';
import { createPty, writePty, resizePty, killPty, getPtyCwd } from './pty';
import { allocatePorts, releasePorts } from './ports';
import { getWorktreeDiff } from './diff';
import { getChannelLocalConfig, setChannelLocalConfig, getAllChannelLocalConfigs, deleteChannelLocalConfig } from './localConfig';
import type { LocalChannelConfig } from './localConfig';

const SPAWN_CLAUDE_CHANNEL = 'spawn-claude';
const DELETE_WORKTREE_CHANNEL = 'delete-worktree';
const CHECK_WORKTREE_CHANNEL = 'check-worktree';
const MERGE_WORKTREE_CHANNEL = 'merge-worktree';
const CLAUDE_ACTIVITY_PING_CHANNEL = 'claude-activity-ping';
const PTY_CREATE_CHANNEL = 'pty-create';
const PTY_WRITE_CHANNEL = 'pty-write';
const PTY_RESIZE_CHANNEL = 'pty-resize';
const PTY_KILL_CHANNEL = 'pty-kill';
const STOP_CLAUDE_CHANNEL = 'stop-claude';
const GET_WORKTREE_DIFF_CHANNEL = 'get-worktree-diff';
const FOCUS_WINDOW_CHANNEL = 'focus-window';
const ALLOCATE_PORTS_CHANNEL = 'allocate-ports';
const RELEASE_PORTS_CHANNEL = 'release-ports';
const SELECT_FOLDER_CHANNEL = 'select-folder';
const GET_LOCAL_CONFIG_CHANNEL = 'get-local-config';
const SET_LOCAL_CONFIG_CHANNEL = 'set-local-config';
const GET_ALL_LOCAL_CONFIGS_CHANNEL = 'get-all-local-configs';
const DELETE_LOCAL_CONFIG_CHANNEL = 'delete-local-config';

let mainWindowRef: BrowserWindow | null = null;

export function setMainWindow(win: BrowserWindow) {
  mainWindowRef = win;
}

export function registerIpcHandlers() {
  ipcMain.removeHandler(SPAWN_CLAUDE_CHANNEL);
  ipcMain.removeHandler(DELETE_WORKTREE_CHANNEL);
  ipcMain.removeHandler(CHECK_WORKTREE_CHANNEL);
  ipcMain.removeHandler(MERGE_WORKTREE_CHANNEL);
  ipcMain.removeHandler(CLAUDE_ACTIVITY_PING_CHANNEL);
  ipcMain.removeHandler(PTY_CREATE_CHANNEL);
  ipcMain.removeHandler(PTY_WRITE_CHANNEL);
  ipcMain.removeHandler(PTY_RESIZE_CHANNEL);
  ipcMain.removeHandler(PTY_KILL_CHANNEL);
  ipcMain.removeHandler(STOP_CLAUDE_CHANNEL);
  ipcMain.removeHandler(GET_WORKTREE_DIFF_CHANNEL);
  ipcMain.removeHandler(FOCUS_WINDOW_CHANNEL);
  ipcMain.removeHandler(ALLOCATE_PORTS_CHANNEL);
  ipcMain.removeHandler(RELEASE_PORTS_CHANNEL);
  ipcMain.removeHandler(SELECT_FOLDER_CHANNEL);
  ipcMain.removeHandler(GET_LOCAL_CONFIG_CHANNEL);
  ipcMain.removeHandler(SET_LOCAL_CONFIG_CHANNEL);
  ipcMain.removeHandler(GET_ALL_LOCAL_CONFIGS_CHANNEL);
  ipcMain.removeHandler(DELETE_LOCAL_CONFIG_CHANNEL);

  ipcMain.handle(SPAWN_CLAUDE_CHANNEL, async (_event, messageId: string, prompt: string, repoPath: string, creationCommands?: string[], resumeSessionId?: string, filePaths?: string[], model?: string, effort?: string) => {
    try {
      const worktreePath = await spawnClaude(messageId, prompt, repoPath, creationCommands, resumeSessionId, filePaths, model, effort);
      return { success: true, worktreePath };
    } catch (err) {
      console.error('Failed to spawn claude:', err);
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle(DELETE_WORKTREE_CHANNEL, async (_event, messageId: string, repoPath: string) => {
    try {
      const result = await deleteWorktree(messageId, repoPath);
      return { success: true, ...result };
    } catch (err) {
      console.error('Failed to delete worktree:', err);
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle(CHECK_WORKTREE_CHANNEL, async (_event, messageId: string) => {
    try {
      const result = checkWorktreeExists(messageId);
      return { success: true, ...result };
    } catch (err) {
      return { success: false, exists: false, error: String(err) };
    }
  });

  ipcMain.handle(MERGE_WORKTREE_CHANNEL, async (_event, messageId: string, repoPath: string, baseBranch: string) => {
    try {
      const result = await mergeWorktree(messageId, repoPath, baseBranch);
      return { success: true, ...result };
    } catch (err) {
      console.error('Failed to merge worktree:', err);
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle(STOP_CLAUDE_CHANNEL, (_event, messageId: string) => {
    try {
      const result = stopClaudeProcess(messageId);
      return { success: true, ...result };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle(
    CLAUDE_ACTIVITY_PING_CHANNEL,
    async (_event, messageId: string, eventType: string) => {
      try {
        if ((eventType ?? '').toLowerCase() === 'stop') {
          markHookStopReceived(messageId);
          stopWatchdog(messageId, 'activity-stop-event');
        } else {
          resetWatchdog(messageId, `activity-event:${eventType}`);
        }
        return { success: true };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  );

  ipcMain.handle(PTY_CREATE_CHANNEL, (_event, terminalId: string, cwd: string, extraEnv?: Record<string, string>) => {
    if (!mainWindowRef) return { success: false, error: 'No main window' };
    try {
      createPty(terminalId, cwd, mainWindowRef, extraEnv);
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle(PTY_WRITE_CHANNEL, (_event, terminalId: string, data: string) => {
    let success = writePty(terminalId, data);
    if (!success && mainWindowRef) {
      const cwd = getPtyCwd(terminalId);
      if (cwd) {
        try {
          createPty(terminalId, cwd, mainWindowRef);
          success = writePty(terminalId, data);
        } catch {
          success = false;
        }
      }
    }
    return { success };
  });

  ipcMain.handle(PTY_RESIZE_CHANNEL, (_event, terminalId: string, cols: number, rows: number) => {
    let success = resizePty(terminalId, cols, rows);
    if (!success && mainWindowRef) {
      const cwd = getPtyCwd(terminalId);
      if (cwd) {
        try {
          createPty(terminalId, cwd, mainWindowRef);
          success = resizePty(terminalId, cols, rows);
        } catch {
          success = false;
        }
      }
    }
    return { success };
  });

  ipcMain.handle(PTY_KILL_CHANNEL, (_event, terminalId: string) => {
    return { success: killPty(terminalId) };
  });

  ipcMain.handle(GET_WORKTREE_DIFF_CHANNEL, async (_event, messageId: string, baseBranch: string) => {
    try {
      const worktreePath = getWorktreePath(messageId);
      const result = await getWorktreeDiff(worktreePath, baseBranch || 'main');
      return { success: true, ...result };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle(ALLOCATE_PORTS_CHANNEL, async (_event, messageId: string, count: number) => {
    try {
      const ports = await allocatePorts(messageId, count);
      return { success: true, ports };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle(RELEASE_PORTS_CHANNEL, (_event, messageId: string) => {
    try {
      releasePorts(messageId);
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle(FOCUS_WINDOW_CHANNEL, () => {
    if (!mainWindowRef) return;
    if (mainWindowRef.isMinimized()) mainWindowRef.restore();
    mainWindowRef.show();
    mainWindowRef.focus();
  });

  ipcMain.handle(SELECT_FOLDER_CHANNEL, async () => {
    if (!mainWindowRef) return { success: false, error: 'No main window' };
    const result = await dialog.showOpenDialog(mainWindowRef, {
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { success: true, canceled: true };
    }
    return { success: true, canceled: false, path: result.filePaths[0] };
  });

  ipcMain.handle(GET_LOCAL_CONFIG_CHANNEL, (_event, channelId: string) => {
    return getChannelLocalConfig(channelId);
  });

  ipcMain.handle(SET_LOCAL_CONFIG_CHANNEL, (_event, channelId: string, data: LocalChannelConfig) => {
    setChannelLocalConfig(channelId, data);
    return { success: true };
  });

  ipcMain.handle(GET_ALL_LOCAL_CONFIGS_CHANNEL, () => {
    return getAllChannelLocalConfigs();
  });

  ipcMain.handle(DELETE_LOCAL_CONFIG_CHANNEL, (_event, channelId: string) => {
    deleteChannelLocalConfig(channelId);
    return { success: true };
  });
}
