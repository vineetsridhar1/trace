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
  getBridgeInfo: () => ipcRenderer.invoke("get-bridge-info"),
  captureFeedbackScreenshot: () => ipcRenderer.invoke("capture-feedback-screenshot"),
  getFeedbackOverlayScreenshot: () => ipcRenderer.invoke("get-feedback-overlay-screenshot"),
  closeFeedbackOverlay: () => ipcRenderer.invoke("close-feedback-overlay"),
  submitFeedbackOverlay: (payload: unknown) =>
    ipcRenderer.invoke("submit-feedback-overlay", payload),
  setFeedbackDestination: (destination: unknown) =>
    ipcRenderer.invoke("set-feedback-destination", destination),
  setBridgeLabel: (label: string) => ipcRenderer.invoke("set-bridge-label", label),
  setBridgeAuthContext: (organizationId: string | null) =>
    ipcRenderer.invoke("set-bridge-auth-context", organizationId),
  onFeedbackShortcut: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on("feedback-shortcut", listener);
    return () => ipcRenderer.removeListener("feedback-shortcut", listener);
  },
  onFeedbackOverlaySubmit: (callback: (payload: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload);
    ipcRenderer.on("feedback-overlay-submit", listener);
    return () => ipcRenderer.removeListener("feedback-overlay-submit", listener);
  },
  onBridgeStatus: (callback: (status: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: string) => callback(status);
    ipcRenderer.on("bridge-status", listener);
    return () => ipcRenderer.removeListener("bridge-status", listener);
  },
});
