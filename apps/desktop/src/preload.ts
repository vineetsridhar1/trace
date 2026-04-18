import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("trace", {
  platform: process.platform,
  send: (channel: string, data: unknown) => ipcRenderer.send(channel, data),
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    ipcRenderer.on(channel, (_event, ...args) => callback(...args));
  },
  pickFolder: () => ipcRenderer.invoke("pick-folder"),
  getGitInfo: (folderPath: string) => ipcRenderer.invoke("get-git-info", folderPath),
  saveRepoPath: (repoId: string, localPath: string) =>
    ipcRenderer.invoke("save-repo-path", repoId, localPath),
  getRepoPath: (repoId: string) => ipcRenderer.invoke("get-repo-path", repoId),
  getRepoConfig: (repoId: string) => ipcRenderer.invoke("get-repo-config", repoId),
  setRepoGitHooksEnabled: (repoId: string, enabled: boolean) =>
    ipcRenderer.invoke("set-repo-git-hooks-enabled", repoId, enabled),
  getRepoGitHookStatus: (repoId: string) => ipcRenderer.invoke("get-repo-git-hook-status", repoId),
  repairRepoGitHooks: (repoId: string) => ipcRenderer.invoke("repair-repo-git-hooks", repoId),
  getBridgeStatus: () => ipcRenderer.invoke("get-bridge-status"),
  setBridgeAuthContext: (token: string | null, organizationId: string | null) =>
    ipcRenderer.invoke("set-bridge-auth-context", token, organizationId),
  onBridgeStatus: (callback: (status: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: string) => callback(status);
    ipcRenderer.on("bridge-status", listener);
    return () => ipcRenderer.removeListener("bridge-status", listener);
  },
});
