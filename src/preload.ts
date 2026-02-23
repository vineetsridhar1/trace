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
  stopClaude: async (
    messageId: string,
  ): Promise<{ success: boolean; stopped?: boolean; error?: string }> => {
    try {
      return await ipcRenderer.invoke('stop-claude', messageId);
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
  checkWorktreeExists: async (
    messageId: string,
  ): Promise<{ success: boolean; exists?: boolean; worktreePath?: string; error?: string }> => {
    try {
      return await ipcRenderer.invoke('check-worktree', messageId);
    } catch (err) {
      return { success: false, exists: false, error: String(err) };
    }
  },
  mergeWorktree: async (
    messageId: string,
  ): Promise<{ success: boolean; branch?: string; error?: string }> => {
    try {
      return await ipcRenderer.invoke('merge-worktree', messageId);
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

  createPty: (terminalId: string, cwd: string) =>
    ipcRenderer.invoke('pty-create', terminalId, cwd),

  writePty: (terminalId: string, data: string) =>
    ipcRenderer.invoke('pty-write', terminalId, data),

  resizePty: (terminalId: string, cols: number, rows: number) =>
    ipcRenderer.invoke('pty-resize', terminalId, cols, rows),

  killPty: (terminalId: string) =>
    ipcRenderer.invoke('pty-kill', terminalId),

  onPtyData: (callback: (terminalId: string, data: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, terminalId: string, data: string) =>
      callback(terminalId, data);
    ipcRenderer.on('pty-data', handler);
    return () => ipcRenderer.removeListener('pty-data', handler);
  },

  onPtyExit: (callback: (terminalId: string, exitCode: number) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, terminalId: string, exitCode: number) =>
      callback(terminalId, exitCode);
    ipcRenderer.on('pty-exit', handler);
    return () => ipcRenderer.removeListener('pty-exit', handler);
  },

  getWorktreeDiff: (messageId: string) =>
    ipcRenderer.invoke('get-worktree-diff', messageId),
});
