import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("traceAPI", {
  getServerUrl: () => ipcRenderer.sendSync("get-server-url") as string,
  spawnAgent: async (
    agentType: string,
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
    baseBranch?: string,
  ): Promise<{
    success: boolean;
    worktreePath?: string;
    setupOutput?: string;
    error?: string;
  }> => {
    try {
      return await ipcRenderer.invoke(
        "spawn-agent",
        agentType,
        workspaceId,
        prompt,
        repoPath,
        creationCommands,
        resumeSessionId,
        filePaths,
        model,
        effort,
        systemInstructions,
        permissionMode,
        baseBranch,
      );
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
  stopAgent: async (
    workspaceId: string,
  ): Promise<{ success: boolean; stopped?: boolean; error?: string }> => {
    try {
      return await ipcRenderer.invoke("stop-agent", workspaceId);
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
  detectAgents: async () => {
    try {
      return await ipcRenderer.invoke("detect-agents");
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
  deleteWorktree: async (
    workspaceId: string,
    repoPath: string,
  ): Promise<{
    success: boolean;
    removed?: boolean;
    worktreePath?: string;
    error?: string;
  }> => {
    try {
      return await ipcRenderer.invoke("delete-worktree", workspaceId, repoPath);
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
  checkWorktreeExists: async (
    workspaceId: string,
    repoPath: string,
  ): Promise<{
    success: boolean;
    exists?: boolean;
    worktreePath?: string;
    error?: string;
  }> => {
    try {
      return await ipcRenderer.invoke("check-worktree", workspaceId, repoPath);
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
      return await ipcRenderer.invoke(
        "merge-worktree",
        workspaceId,
        repoPath,
        baseBranch,
      );
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
  commitWorktreeChanges: async (
    workspaceId: string,
  ): Promise<{ success: boolean; committed?: boolean; error?: string }> => {
    try {
      return await ipcRenderer.invoke("commit-worktree-changes", workspaceId);
    } catch (err) {
      return { success: false, committed: false, error: String(err) };
    }
  },
  reportAgentActivity: async (
    workspaceId: string,
    eventType: string,
    sessionId?: string,
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      return await ipcRenderer.invoke(
        "agent-activity-ping",
        workspaceId,
        eventType,
        sessionId,
      );
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  createPty: (
    terminalId: string,
    cwd: string,
    extraEnv?: Record<string, string>,
  ) => ipcRenderer.invoke("pty-create", terminalId, cwd, extraEnv),

  writePty: (terminalId: string, data: string) =>
    ipcRenderer.invoke("pty-write", terminalId, data),

  resizePty: (terminalId: string, cols: number, rows: number) =>
    ipcRenderer.invoke("pty-resize", terminalId, cols, rows),

  killPty: (terminalId: string) => ipcRenderer.invoke("pty-kill", terminalId),

  hasPty: (terminalId: string) => ipcRenderer.invoke("pty-has", terminalId),

  getPtyProcesses: (terminalIds: string[]) =>
    ipcRenderer.invoke("pty-get-processes", terminalIds) as Promise<{
      success: boolean;
      processes: Record<string, { processName: string; isShellOnly: boolean }>;
    }>,

  onPtyData: (callback: (terminalId: string, data: string) => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      terminalId: string,
      data: string,
    ) => callback(terminalId, data);
    ipcRenderer.on("pty-data", handler);
    return () => ipcRenderer.removeListener("pty-data", handler);
  },

  onPtyExit: (callback: (terminalId: string, exitCode: number) => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      terminalId: string,
      exitCode: number,
    ) => callback(terminalId, exitCode);
    ipcRenderer.on("pty-exit", handler);
    return () => ipcRenderer.removeListener("pty-exit", handler);
  },

  onCloseTerminalTab: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on("close-terminal-tab", handler);
    return () => ipcRenderer.removeListener("close-terminal-tab", handler);
  },

  onClaudeProcessExited: (callback: (workspaceId: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, workspaceId: string) =>
      callback(workspaceId);
    ipcRenderer.on("claude-process-exited", handler);
    return () => ipcRenderer.removeListener("claude-process-exited", handler);
  },

  getWorktreeDiff: (workspaceId: string, baseBranch: string) =>
    ipcRenderer.invoke("get-worktree-diff", workspaceId, baseBranch),

  allocatePorts: (workspaceId: string, count: number) =>
    ipcRenderer.invoke("allocate-ports", workspaceId, count),

  releasePorts: (workspaceId: string) =>
    ipcRenderer.invoke("release-ports", workspaceId),

  focusWindow: () => ipcRenderer.invoke("focus-window"),

  selectFolder: () =>
    ipcRenderer.invoke("select-folder") as Promise<{
      success: boolean;
      canceled?: boolean;
      path?: string;
      error?: string;
    }>,

  getLocalConfig: (channelId: string) =>
    ipcRenderer.invoke("get-local-config", channelId),

  setLocalConfig: (
    channelId: string,
    data: {
      localRepoPath: string;
      creationScript?: string;
      startupScripts?: { name: string; command: string }[];
    },
  ) => ipcRenderer.invoke("set-local-config", channelId, data),

  getAllLocalConfigs: () => ipcRenderer.invoke("get-all-local-configs"),

  deleteLocalConfig: (channelId: string) =>
    ipcRenderer.invoke("delete-local-config", channelId),

  getGlobalConfig: () => ipcRenderer.invoke("get-global-config"),

  setGlobalConfig: (data: { terminalFontFamily?: string }) =>
    ipcRenderer.invoke("set-global-config", data),

  listRepoFiles: (repoPath: string) =>
    ipcRenderer.invoke("list-repo-files", repoPath) as Promise<{
      success: boolean;
      files: string[];
      error?: string;
    }>,

  suggestScripts: (repoPath: string) =>
    ipcRenderer.invoke("suggest-scripts", repoPath) as Promise<{
      success: boolean;
      setupScript?: string;
      runScript?: string;
      error?: string;
    }>,

  validateRepo: (repoPath: string) =>
    ipcRenderer.invoke("validate-repo", repoPath) as Promise<{
      valid: boolean;
      originUrl?: string;
      error?: string;
    }>,

  listRepoBranches: (repoPath: string) =>
    ipcRenderer.invoke("list-repo-branches", repoPath) as Promise<{
      success: boolean;
      branches: string[];
      error?: string;
    }>,

  checkBranchesMerged: (
    repoPath: string,
    targets: Array<{ workspaceId: string; branch: string }>,
    baseBranch: string,
  ) =>
    ipcRenderer.invoke(
      "check-branches-merged",
      repoPath,
      targets,
      baseBranch,
    ) as Promise<{
      success: boolean;
      merged: Record<string, boolean>;
      error?: string;
    }>,

  watchBaseBranch: (repoPath: string, baseBranch: string) =>
    ipcRenderer.invoke("watch-base-branch", repoPath, baseBranch) as Promise<{
      success: boolean;
    }>,

  unwatchBaseBranch: () =>
    ipcRenderer.invoke("unwatch-base-branch") as Promise<{ success: boolean }>,

  onBaseBranchChanged: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on("base-branch-changed", handler);
    return () => ipcRenderer.removeListener("base-branch-changed", handler);
  },

  githubLogin: () =>
    ipcRenderer.invoke("github-login") as Promise<{
      success: boolean;
      token?: string;
      user?: {
        id: string;
        email: string;
        name: string;
        avatarUrl: string | null;
      };
      error?: string;
    }>,

  checkMainStatus: (repoPath: string, baseBranch: string) =>
    ipcRenderer.invoke("check-main-status", repoPath, baseBranch) as Promise<{
      success: boolean;
      isUpToDate?: boolean;
      commitsBehind?: number;
      commits?: {
        hash: string;
        author: string;
        message: string;
        date: string;
      }[];
      localSha?: string;
      remoteSha?: string;
      error?: string;
    }>,

  pullMain: (repoPath: string, baseBranch: string) =>
    ipcRenderer.invoke("pull-main", repoPath, baseBranch) as Promise<{
      success: boolean;
      error?: string;
    }>,

  detectInstalledApps: () =>
    ipcRenderer.invoke("detect-installed-apps") as Promise<{
      success: boolean;
      apps: Array<{ id: string; label: string }>;
      error?: string;
    }>,

  openInApp: (appId: string, targetPath: string) =>
    ipcRenderer.invoke("open-in-app", appId, targetPath) as Promise<{
      success: boolean;
      error?: string;
    }>,

  listSlashCommands: (repoPath: string) =>
    ipcRenderer.invoke("list-slash-commands", repoPath) as Promise<{
      success: boolean;
      commands: Array<{
        name: string;
        description: string;
        source: "global" | "project";
      }>;
      error?: string;
    }>,

  checkGhAuth: () =>
    ipcRenderer.invoke("check-gh-auth") as Promise<{
      success: boolean;
      available: boolean;
    }>,

  checkPRStatusesLocal: (repoPath: string, branches: string[]) =>
    ipcRenderer.invoke(
      "check-pr-statuses-local",
      repoPath,
      branches,
    ) as Promise<{
      success: boolean;
      statuses?: Array<{
        branch: string;
        state: "open" | "closed" | "merged" | "none";
        prUrl: string | null;
      }>;
      error?: string;
    }>,

  listPullRequests: async (repoPath: string) => {
    try {
      return await ipcRenderer.invoke("list-pull-requests", repoPath);
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  checkoutPullRequest: async (
    repoPath: string,
    branchName: string,
    workspaceId: string,
    setupCommands?: string[],
  ) => {
    try {
      return await ipcRenderer.invoke(
        "checkout-pull-request",
        repoPath,
        branchName,
        workspaceId,
        setupCommands,
      );
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  checkPRCILocal: (repoPath: string, branches: string[]) =>
    ipcRenderer.invoke("check-pr-ci-local", repoPath, branches) as Promise<{
      success: boolean;
      statuses?: Array<{
        branch: string;
        total: number;
        passed: number;
        failed: number;
        pending: number;
      }>;
      error?: string;
    }>,

  pushWorktreeBranch: (workspaceId: string, repoPath: string) =>
    ipcRenderer.invoke(
      "push-worktree-branch",
      workspaceId,
      repoPath,
    ) as Promise<{ success: boolean; error?: string }>,

  ensureWorktreeFromRemote: (
    workspaceId: string,
    repoPath: string,
    branchName: string,
  ) =>
    ipcRenderer.invoke(
      "ensure-worktree-from-remote",
      workspaceId,
      repoPath,
      branchName,
    ) as Promise<{ success: boolean; worktreePath?: string; error?: string }>,

  checkRunningProcesses: (workspaceIds: string[]) =>
    ipcRenderer.invoke("check-running-processes", workspaceIds) as Promise<{
      success: boolean;
      running: string[];
    }>,

  readProductDocFile: (filePath: string) =>
    ipcRenderer.invoke("read-product-doc-file", filePath) as Promise<{
      success: boolean;
      content?: string;
      error?: string;
    }>,

  writeProductDocFile: (filePath: string, content: string) =>
    ipcRenderer.invoke("write-product-doc-file", filePath, content) as Promise<{
      success: boolean;
      error?: string;
    }>,

  createGitBranch: (repoPath: string, branchName: string, baseBranch: string, scopingDocsPath?: string) =>
    ipcRenderer.invoke("create-git-branch", repoPath, branchName, baseBranch, scopingDocsPath) as Promise<{
      success: boolean;
      error?: string;
    }>,
});
