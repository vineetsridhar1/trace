import { ipcMain } from 'electron';
import { spawnClaude } from './claude';
import { deleteWorktree } from './worktree';
import { resetWatchdog, stopWatchdog } from './watchdog';

const SPAWN_CLAUDE_CHANNEL = 'spawn-claude';
const DELETE_WORKTREE_CHANNEL = 'delete-worktree';
const CLAUDE_ACTIVITY_PING_CHANNEL = 'claude-activity-ping';

export function registerIpcHandlers() {
  ipcMain.removeHandler(SPAWN_CLAUDE_CHANNEL);
  ipcMain.removeHandler(DELETE_WORKTREE_CHANNEL);
  ipcMain.removeHandler(CLAUDE_ACTIVITY_PING_CHANNEL);

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
}
