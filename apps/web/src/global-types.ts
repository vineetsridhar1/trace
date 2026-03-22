/// <reference types="vite/client" />

declare global {
  type DesktopBridgeConnectionStatus = "connecting" | "connected" | "disconnected";

  type GitInfoResult =
    | {
        name: string;
        remoteUrl: string;
        defaultBranch: string;
      }
    | {
        error: string;
      };

  interface TraceElectronBridge {
    platform: string;
    send: (channel: string, data: unknown) => void;
    on: (channel: string, callback: (...args: unknown[]) => void) => void;
    pickFolder: () => Promise<string | null>;
    getGitInfo: (folderPath: string) => Promise<GitInfoResult>;
    saveRepoPath: (repoId: string, localPath: string) => Promise<unknown>;
    getRepoPath: (repoId: string) => Promise<string | null>;
    getBridgeStatus: () => Promise<DesktopBridgeConnectionStatus>;
    onBridgeStatus: (callback: (status: DesktopBridgeConnectionStatus) => void) => () => void;
  }

  interface Window {
    trace?: TraceElectronBridge;
  }
}

export {};
