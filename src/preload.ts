import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('traceAPI', {
  getServerUrl: () => ipcRenderer.sendSync('get-server-url') as string,
  spawnClaude: async (
    messageId: string,
    prompt: string,
    repoPath: string,
    creationCommands?: string[],
    resumeSessionId?: string,
    filePaths?: string[],
    model?: string,
    effort?: string,
    systemInstructions?: string,
  ): Promise<{ success: boolean; worktreePath?: string; error?: string }> => {
    try {
      return await ipcRenderer.invoke('spawn-claude', messageId, prompt, repoPath, creationCommands, resumeSessionId, filePaths, model, effort, systemInstructions);
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
    repoPath: string,
  ): Promise<{ success: boolean; removed?: boolean; worktreePath?: string; error?: string }> => {
    try {
      return await ipcRenderer.invoke('delete-worktree', messageId, repoPath);
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
  checkWorktreeExists: async (
    messageId: string,
    repoPath: string,
  ): Promise<{ success: boolean; exists?: boolean; worktreePath?: string; error?: string }> => {
    try {
      return await ipcRenderer.invoke('check-worktree', messageId, repoPath);
    } catch (err) {
      return { success: false, exists: false, error: String(err) };
    }
  },
  mergeWorktree: async (
    messageId: string,
    repoPath: string,
    baseBranch: string,
  ): Promise<{ success: boolean; branch?: string; error?: string }> => {
    try {
      return await ipcRenderer.invoke('merge-worktree', messageId, repoPath, baseBranch);
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

  createPty: (terminalId: string, cwd: string, extraEnv?: Record<string, string>) =>
    ipcRenderer.invoke('pty-create', terminalId, cwd, extraEnv),

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

  getWorktreeDiff: (messageId: string, baseBranch: string) =>
    ipcRenderer.invoke('get-worktree-diff', messageId, baseBranch),

  allocatePorts: (messageId: string, count: number) =>
    ipcRenderer.invoke('allocate-ports', messageId, count),

  releasePorts: (messageId: string) =>
    ipcRenderer.invoke('release-ports', messageId),

  focusWindow: () => ipcRenderer.invoke('focus-window'),

  selectFolder: () =>
    ipcRenderer.invoke('select-folder') as Promise<{ success: boolean; canceled?: boolean; path?: string; error?: string }>,

  getLocalConfig: (channelId: string) =>
    ipcRenderer.invoke('get-local-config', channelId),

  setLocalConfig: (channelId: string, data: { localRepoPath: string; creationScript?: string; startupScripts?: { name: string; command: string }[] }) =>
    ipcRenderer.invoke('set-local-config', channelId, data),

  getAllLocalConfigs: () =>
    ipcRenderer.invoke('get-all-local-configs'),

  deleteLocalConfig: (channelId: string) =>
    ipcRenderer.invoke('delete-local-config', channelId),

  listRepoFiles: (repoPath: string) =>
    ipcRenderer.invoke('list-repo-files', repoPath) as Promise<{ success: boolean; files: string[]; error?: string }>,
});
