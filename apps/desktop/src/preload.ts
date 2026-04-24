import { contextBridge, ipcRenderer } from "electron";
import type { BridgeTunnelSlot } from "@trace/shared";
import type { BridgeTunnelSlotConfig } from "./config.js";

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
  setBridgeAuthContext: (organizationId: string | null) =>
    ipcRenderer.invoke("set-bridge-auth-context", organizationId),
  getBridgeTunnelSlots: () => ipcRenderer.invoke("get-bridge-tunnel-slots"),
  saveBridgeTunnelSlots: (slots: BridgeTunnelSlotConfig[]) =>
    ipcRenderer.invoke("save-bridge-tunnel-slots", slots),
  startBridgeTunnel: (slotId: string) => ipcRenderer.invoke("start-bridge-tunnel", slotId),
  stopBridgeTunnel: (slotId: string) => ipcRenderer.invoke("stop-bridge-tunnel", slotId),
  retargetBridgeTunnel: (slotId: string, targetPort: number) =>
    ipcRenderer.invoke("retarget-bridge-tunnel", slotId, targetPort),
  onBridgeStatus: (callback: (status: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: string) => callback(status);
    ipcRenderer.on("bridge-status", listener);
    return () => ipcRenderer.removeListener("bridge-status", listener);
  },
  onBridgeTunnelSlots: (callback: (slots: BridgeTunnelSlot[]) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, slots: BridgeTunnelSlot[]) =>
      callback(slots);
    ipcRenderer.on("bridge-tunnel-slots", listener);
    return () => ipcRenderer.removeListener("bridge-tunnel-slots", listener);
  },
});
