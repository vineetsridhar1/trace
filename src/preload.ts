import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('traceAPI', {
  spawnClaude: async (
    messageId: string,
    prompt: string,
  ): Promise<{ success: boolean; worktreePath?: string; error?: string }> => {
    try {
      return await ipcRenderer.invoke('spawn-claude', messageId, prompt);
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
  deleteWorktree: async (
    messageId: string,
  ): Promise<{ success: boolean; removed?: boolean; worktreePath?: string; error?: string }> => {
    try {
      return await ipcRenderer.invoke('delete-worktree', messageId);
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
  reportClaudeActivity: async (
    messageId: string,
    eventType: string,
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      return await ipcRenderer.invoke('claude-activity-ping', messageId, eventType);
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});
