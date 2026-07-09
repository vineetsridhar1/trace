declare global {
  interface ImportMetaEnv {
    readonly DEV?: boolean;
    readonly VITE_API_URL?: string;
    readonly VITE_WS_URL?: string;
    readonly VITE_TRACE_LOCAL_MODE?: string;
    readonly VITE_ENABLE_MESSAGING?: string;
    readonly VITE_ENABLE_TICKETS?: string;
    readonly VITE_ENABLE_AGENT_DEBUG?: string;
    readonly VITE_ENABLE_AGENT?: string;
    readonly VITE_TRACE_USER_CONTENT_ORIGIN?: string;
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

  type DesktopBridgeInfo = {
    instanceId: string;
    label: string;
    status: DesktopBridgeConnectionStatus;
  };

  type DesktopGithubCliStatus = {
    installed: boolean;
    authenticated: boolean;
    error: string | null;
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
    hasUncommittedChanges: boolean;
    changedFiles: DesktopLinkedCheckoutChangedFile[];
    changedFilesTotalCount: number;
    changedFilesTruncated: boolean;
  };

  type DesktopLinkedCheckoutChangedFile = {
    path: string;
    status: string;
    additions: number;
    deletions: number;
    diff: string;
    truncated: boolean;
    originalContent: string;
    modifiedContent: string;
    contentTruncated: boolean;
  };

  type DesktopLinkedCheckoutActionResult = {
    ok: boolean;
    status: DesktopLinkedCheckoutStatus;
    error: string | null;
    errorCode?: "DIRTY_ROOT_CHECKOUT" | null;
  };

  type DesktopLinkedCheckoutSyncInput = {
    repoId: string;
    sessionGroupId: string;
    branch: string;
    commitSha?: string | null;
    autoSyncEnabled?: boolean;
    conflictStrategy?: "DISCARD" | "COMMIT" | "REBASE" | "STASH" | null;
    commitMessage?: string | null;
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
        remoteUrl: string | null;
        defaultBranch: string;
      }
    | {
        error: string;
      };

  type CreateLocalProjectResult =
    | {
        name: string;
        path: string;
        remoteUrl: string | null;
        defaultBranch: string;
      }
    | {
        error: string;
      };

  type ProjectParentSelectionResult = {
    token: string;
    path: string;
  } | null;

  interface TraceElectronBridge {
    platform: string;
    send: (channel: string, data: unknown) => void;
    on: (channel: string, callback: (...args: unknown[]) => void) => void;
    pickFolder: () => Promise<string | null>;
    getGitInfo: (folderPath: string) => Promise<GitInfoResult>;
    pickProjectParentFolder: () => Promise<ProjectParentSelectionResult>;
    createLocalProject: (input: {
      name: string;
      parentToken: string;
    }) => Promise<CreateLocalProjectResult>;
    saveRepoPath: (repoId: string, localPath: string) => Promise<DesktopRepoConfig>;
    getRepoPath: (repoId: string) => Promise<string | null>;
    getRepoConfig: (repoId: string) => Promise<DesktopRepoConfig | null>;
    getGithubCliStatus: () => Promise<DesktopGithubCliStatus>;
    getGithubAuthToken: () => Promise<string>;
    setRepoGitHooksEnabled: (
      repoId: string,
      enabled: boolean,
    ) => Promise<{ config: DesktopRepoConfig | null; status: DesktopRepoGitHookStatus | null }>;
    getRepoGitHookStatus: (repoId: string) => Promise<DesktopRepoGitHookStatus | null>;
    repairRepoGitHooks: (repoId: string) => Promise<DesktopRepoGitHookStatus | null>;
    getBridgeStatus: () => Promise<DesktopBridgeConnectionStatus>;
    getBridgeInfo: () => Promise<DesktopBridgeInfo>;
    setBridgeLabel: (label: string) => Promise<DesktopBridgeInfo>;
    setBridgeAuthContext: (organizationId: string | null) => Promise<boolean>;
    onBridgeStatus: (callback: (status: DesktopBridgeConnectionStatus) => void) => () => void;
    onMenuCommand?: (callback: (command: string) => void) => () => void;
  }

  interface Window {
    trace?: TraceElectronBridge;
  }
}

export {};
