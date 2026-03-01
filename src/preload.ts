import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('traceAPI', {
  getServerUrl: () => ipcRenderer.sendSync('get-server-url') as string,
  spawnClaude: async (
    workspaceId: string,
    prompt: string,
    repoPath: string,
    creationCommands?: string[],
    resumeSessionId?: string,
    filePaths?: string[],
    model?: string,
    effort?: string,
    systemInstructions?: string,
    permissionMode?: string,
  ): Promise<{ success: boolean; worktreePath?: string; error?: string }> => {
    try {
      return await ipcRenderer.invoke('spawn-claude', workspaceId, prompt, repoPath, creationCommands, resumeSessionId, filePaths, model, effort, systemInstructions, permissionMode);
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
  stopClaude: async (
    workspaceId: string,
  ): Promise<{ success: boolean; stopped?: boolean; error?: string }> => {
    try {
      return await ipcRenderer.invoke('stop-claude', workspaceId);
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
  deleteWorktree: async (
    workspaceId: string,
    repoPath: string,
  ): Promise<{ success: boolean; removed?: boolean; worktreePath?: string; error?: string }> => {
    try {
      return await ipcRenderer.invoke('delete-worktree', workspaceId, repoPath);
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
  checkWorktreeExists: async (
    workspaceId: string,
    repoPath: string,
  ): Promise<{ success: boolean; exists?: boolean; worktreePath?: string; error?: string }> => {
    try {
      return await ipcRenderer.invoke('check-worktree', workspaceId, repoPath);
    } catch (err) {
      return { success: false, exists: false, error: String(err) };
    }
  },
  mergeWorktree: async (
    workspaceId: string,
    repoPath: string,
    baseBranch: string,
  ): Promise<{ success: boolean; branch?: string; error?: string }> => {
    try {
      return await ipcRenderer.invoke('merge-worktree', workspaceId, repoPath, baseBranch);
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
  reportClaudeActivity: async (
    workspaceId: string,
    eventType: string,
    sessionId?: string,
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      return await ipcRenderer.invoke('claude-activity-ping', workspaceId, eventType, sessionId);
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

  hasPty: (terminalId: string) =>
    ipcRenderer.invoke('pty-has', terminalId),

  getPtyProcesses: (terminalIds: string[]) =>
    ipcRenderer.invoke('pty-get-processes', terminalIds) as Promise<{
      success: boolean;
      processes: Record<string, { processName: string; isShellOnly: boolean }>;
    }>,

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

  getWorktreeDiff: (workspaceId: string, baseBranch: string) =>
    ipcRenderer.invoke('get-worktree-diff', workspaceId, baseBranch),

  allocatePorts: (workspaceId: string, count: number) =>
    ipcRenderer.invoke('allocate-ports', workspaceId, count),

  releasePorts: (workspaceId: string) =>
    ipcRenderer.invoke('release-ports', workspaceId),

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

  suggestScripts: (repoPath: string) =>
    ipcRenderer.invoke('suggest-scripts', repoPath) as Promise<{ success: boolean; setupScript?: string; runScript?: string; error?: string }>,

  validateRepo: (repoPath: string) =>
    ipcRenderer.invoke('validate-repo', repoPath) as Promise<{ valid: boolean; originUrl?: string; error?: string }>,

  listRepoBranches: (repoPath: string) =>
    ipcRenderer.invoke('list-repo-branches', repoPath) as Promise<{ success: boolean; branches: string[]; error?: string }>,

  checkBranchesMerged: (repoPath: string, targets: Array<{ workspaceId: string; branch: string }>, baseBranch: string) =>
    ipcRenderer.invoke('check-branches-merged', repoPath, targets, baseBranch) as Promise<{ success: boolean; merged: Record<string, boolean>; error?: string }>,

  watchBaseBranch: (repoPath: string, baseBranch: string) =>
    ipcRenderer.invoke('watch-base-branch', repoPath, baseBranch) as Promise<{ success: boolean }>,

  unwatchBaseBranch: () =>
    ipcRenderer.invoke('unwatch-base-branch') as Promise<{ success: boolean }>,

  onBaseBranchChanged: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('base-branch-changed', handler);
    return () => ipcRenderer.removeListener('base-branch-changed', handler);
  },

  githubLogin: () =>
    ipcRenderer.invoke('github-login') as Promise<{ success: boolean; token?: string; user?: { id: string; email: string; name: string; avatarUrl: string | null }; error?: string }>,

  checkMainStatus: (repoPath: string, baseBranch: string) =>
    ipcRenderer.invoke('check-main-status', repoPath, baseBranch) as Promise<{ success: boolean; isUpToDate?: boolean; commitsBehind?: number; localSha?: string; remoteSha?: string; error?: string }>,

  pullMain: (repoPath: string, baseBranch: string) =>
    ipcRenderer.invoke('pull-main', repoPath, baseBranch) as Promise<{ success: boolean; error?: string }>,
});
