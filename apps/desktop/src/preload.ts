import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("trace", {
  platform: process.platform,
  send: (channel: string, data: unknown) => ipcRenderer.send(channel, data),
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    ipcRenderer.on(channel, (_event, ...args) => callback(...args));
  },
  pickFolder: () => ipcRenderer.invoke("pick-folder"),
  getGitInfo: (folderPath: string) => ipcRenderer.invoke("get-git-info", folderPath),
  pickProjectParentFolder: () => ipcRenderer.invoke("pick-project-parent-folder"),
  createLocalProject: (input: { name: string; parentToken: string }) =>
    ipcRenderer.invoke("create-local-project", input),
  saveRepoPath: (repoId: string, localPath: string) =>
    ipcRenderer.invoke("save-repo-path", repoId, localPath),
  getRepoPath: (repoId: string) => ipcRenderer.invoke("get-repo-path", repoId),
  getRepoConfig: (repoId: string) => ipcRenderer.invoke("get-repo-config", repoId),
  getGithubCliStatus: () => ipcRenderer.invoke("get-github-cli-status"),
  getGithubAuthToken: () => ipcRenderer.invoke("get-github-auth-token"),
  loginCodexWithChatgpt: () => ipcRenderer.invoke("login-codex-with-chatgpt"),
  getCodingToolStatuses: () => ipcRenderer.invoke("get-coding-tool-statuses"),
  installOrUpdateCodingTool: (toolId: string) =>
    ipcRenderer.invoke("install-or-update-coding-tool", toolId),
  getBridgeStatus: () => ipcRenderer.invoke("get-bridge-status"),
  getBridgeInfo: () => ipcRenderer.invoke("get-bridge-info"),
  getSessionGitSyncStatus: (sessionId: string) =>
    ipcRenderer.invoke("get-session-git-sync-status", sessionId),
  setBridgeLabel: (label: string) => ipcRenderer.invoke("set-bridge-label", label),
  setBridgeAuthContext: (organizationId: string | null) =>
    ipcRenderer.invoke("set-bridge-auth-context", organizationId),
  onBridgeStatus: (callback: (status: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: string) => callback(status);
    ipcRenderer.on("bridge-status", listener);
    return () => ipcRenderer.removeListener("bridge-status", listener);
  },
  onMenuCommand: (callback: (command: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, command: string) => callback(command);
    ipcRenderer.on("menu-command", listener);
    return () => ipcRenderer.removeListener("menu-command", listener);
  },
  activateBrowser: (input: { sessionGroupId: string; browserId: string }) =>
    ipcRenderer.invoke("browser-activate", input),
  hideBrowser: (input: { sessionGroupId: string; browserId: string }) =>
    ipcRenderer.invoke("browser-hide", input),
  destroyBrowser: (input: { sessionGroupId: string; browserId: string }) =>
    ipcRenderer.invoke("browser-destroy", input),
  setBrowserBounds: (input: {
    sessionGroupId: string;
    browserId: string;
    bounds: Electron.Rectangle;
  }) =>
    ipcRenderer.invoke("browser-set-bounds", input),
  setBrowserOverlayHidden: (input: {
    sessionGroupId: string;
    browserId: string;
    hidden: boolean;
  }) =>
    ipcRenderer.invoke("browser-set-overlay-hidden", input),
  navigateBrowser: (input: { sessionGroupId: string; browserId: string; url: string }) =>
    ipcRenderer.invoke("browser-navigate", input),
  goBrowserBack: (input: { sessionGroupId: string; browserId: string }) =>
    ipcRenderer.invoke("browser-back", input),
  goBrowserForward: (input: { sessionGroupId: string; browserId: string }) =>
    ipcRenderer.invoke("browser-forward", input),
  reloadBrowser: (input: { sessionGroupId: string; browserId: string }) =>
    ipcRenderer.invoke("browser-reload", input),
  toggleBrowserDevTools: (input: { sessionGroupId: string; browserId: string }) =>
    ipcRenderer.invoke("browser-toggle-devtools", input),
  onBrowserWorkspaceState: (callback: (state: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: unknown) => callback(state);
    ipcRenderer.on("browser-workspace-state", listener);
    return () => ipcRenderer.removeListener("browser-workspace-state", listener);
  },
  onBrowserTabOpenRequested: (callback: (request: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, request: unknown) => callback(request);
    ipcRenderer.on("browser-tab-open-requested", listener);
    return () => ipcRenderer.removeListener("browser-tab-open-requested", listener);
  },
});
