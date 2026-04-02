/// <reference types="vite/client" />

declare global {
  type DesktopBridgeConnectionStatus = "connecting" | "connected" | "disconnected";
  type DesktopGitHookState = "not_installed" | "trace_managed" | "custom_present" | "chained" | "error";

  type DesktopRepoConfig = {
    path: string;
    gitHooksEnabled: boolean;
  };

  type DesktopRepoGitHookStatus = {
    hooksDir: string;
    state: DesktopGitHookState;
    hooks: Array<{
      hookName: string;
      hookPath: string;
      state: DesktopGitHookState;
      isExecutable: boolean;
      runnerPath: string | null;
      chainedHookPath: string | null;
      error?: string | null;
    }>;
  };

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
    saveRepoPath: (repoId: string, localPath: string) => Promise<DesktopRepoConfig>;
    getRepoPath: (repoId: string) => Promise<string | null>;
    getRepoConfig: (repoId: string) => Promise<DesktopRepoConfig | null>;
    setRepoGitHooksEnabled: (
      repoId: string,
      enabled: boolean,
    ) => Promise<{ config: DesktopRepoConfig | null; status: DesktopRepoGitHookStatus | null }>;
    getRepoGitHookStatus: (repoId: string) => Promise<DesktopRepoGitHookStatus | null>;
    repairRepoGitHooks: (repoId: string) => Promise<DesktopRepoGitHookStatus | null>;
    setBridgeAuthToken: (token: string | null) => void;
    getBridgeStatus: () => Promise<DesktopBridgeConnectionStatus>;
    onBridgeStatus: (callback: (status: DesktopBridgeConnectionStatus) => void) => () => void;
  }

  interface Window {
    trace?: TraceElectronBridge;
  }
}

export {};
