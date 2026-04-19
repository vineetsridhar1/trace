declare global {
  interface ImportMetaEnv {
    readonly DEV?: boolean;
    readonly VITE_API_URL?: string;
    readonly VITE_WS_URL?: string;
    readonly VITE_AG_GRID_LICENSE_KEY?: string;
    readonly VITE_ENABLE_MESSAGING?: string;
    readonly VITE_ENABLE_TICKETS?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }

  type DesktopBridgeConnectionStatus = "connecting" | "connected" | "disconnected";
  type DesktopGitHookState =
    | "not_installed"
    | "trace_managed"
    | "custom_present"
    | "chained"
    | "error";

  type DesktopRepoConfig = {
    path: string;
    gitHooksEnabled: boolean;
    linkedCheckout?: {
      sessionGroupId: string;
      targetBranch: string;
      autoSyncEnabled: boolean;
      originalBranch: string | null;
      originalCommitSha: string;
      lastSyncedCommitSha: string | null;
      lastSyncError: string | null;
      lastSyncAt: string | null;
    } | null;
  };

  type DesktopLinkedCheckoutStatus = {
    repoId: string;
    repoPath: string | null;
    isAttached: boolean;
    attachedSessionGroupId: string | null;
    targetBranch: string | null;
    autoSyncEnabled: boolean;
    currentBranch: string | null;
    currentCommitSha: string | null;
    lastSyncedCommitSha: string | null;
    lastSyncError: string | null;
    restoreBranch: string | null;
    restoreCommitSha: string | null;
  };

  type DesktopLinkedCheckoutActionResult = {
    ok: boolean;
    status: DesktopLinkedCheckoutStatus;
    error: string | null;
  };

  type DesktopLinkedCheckoutSyncInput = {
    repoId: string;
    sessionGroupId: string;
    branch: string;
    commitSha?: string | null;
    autoSyncEnabled?: boolean;
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
    getBridgeStatus: () => Promise<DesktopBridgeConnectionStatus>;
    setBridgeAuthContext: (
      token: string | null,
      organizationId: string | null,
    ) => Promise<boolean>;
    onBridgeStatus: (callback: (status: DesktopBridgeConnectionStatus) => void) => () => void;
  }

  interface Window {
    trace?: TraceElectronBridge;
  }
}

export {};
