import { ipcMain, type BrowserWindow } from 'electron';
import { spawnClaude } from './claude';
import { checkWorktreeExists, deleteWorktree, mergeWorktree, getWorktreePath } from './worktree';
import { resetWatchdog, stopWatchdog } from './watchdog';
import { createPty, writePty, resizePty, killPty } from './pty';
import { getWorktreeDiff } from './diff';

const SPAWN_CLAUDE_CHANNEL = 'spawn-claude';
const DELETE_WORKTREE_CHANNEL = 'delete-worktree';
const CHECK_WORKTREE_CHANNEL = 'check-worktree';
const MERGE_WORKTREE_CHANNEL = 'merge-worktree';
const CLAUDE_ACTIVITY_PING_CHANNEL = 'claude-activity-ping';
const PTY_CREATE_CHANNEL = 'pty-create';
const PTY_WRITE_CHANNEL = 'pty-write';
const PTY_RESIZE_CHANNEL = 'pty-resize';
const PTY_KILL_CHANNEL = 'pty-kill';
const GET_WORKTREE_DIFF_CHANNEL = 'get-worktree-diff';
const FOCUS_WINDOW_CHANNEL = 'focus-window';

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
  ipcMain.removeHandler(GET_WORKTREE_DIFF_CHANNEL);
  ipcMain.removeHandler(FOCUS_WINDOW_CHANNEL);

  ipcMain.handle(SPAWN_CLAUDE_CHANNEL, async (_event, messageId: string, prompt: string) => {
    try {
      const worktreePath = await spawnClaude(messageId, prompt);
      return { success: true, worktreePath };
    } catch (err) {
      console.error('Failed to spawn claude:', err);
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle(DELETE_WORKTREE_CHANNEL, async (_event, messageId: string) => {
    try {
      const result = await deleteWorktree(messageId);
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

  ipcMain.handle(MERGE_WORKTREE_CHANNEL, async (_event, messageId: string) => {
    try {
      const result = await mergeWorktree(messageId);
      return { success: true, ...result };
    } catch (err) {
      console.error('Failed to merge worktree:', err);
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle(
    CLAUDE_ACTIVITY_PING_CHANNEL,
    async (_event, messageId: string, eventType: string) => {
      try {
        if ((eventType ?? '').toLowerCase() === 'stop') {
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

  ipcMain.handle(PTY_CREATE_CHANNEL, (_event, terminalId: string, cwd: string) => {
    if (!mainWindowRef) return { success: false, error: 'No main window' };
    try {
      createPty(terminalId, cwd, mainWindowRef);
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle(PTY_WRITE_CHANNEL, (_event, terminalId: string, data: string) => {
    writePty(terminalId, data);
  });

  ipcMain.handle(PTY_RESIZE_CHANNEL, (_event, terminalId: string, cols: number, rows: number) => {
    resizePty(terminalId, cols, rows);
  });

  ipcMain.handle(PTY_KILL_CHANNEL, (_event, terminalId: string) => {
    killPty(terminalId);
  });

  ipcMain.handle(GET_WORKTREE_DIFF_CHANNEL, async (_event, messageId: string) => {
    try {
      const worktreePath = getWorktreePath(messageId);
      const result = await getWorktreeDiff(worktreePath);
      return { success: true, ...result };
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
}
