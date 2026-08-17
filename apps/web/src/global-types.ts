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
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }

  type DesktopBridgeConnectionStatus = "connecting" | "connected" | "disconnected";
  type DesktopRepoConfig = {
    path: string;
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

  type DesktopCodingToolStatus = {
    tool: string;
    label: string;
    status: "installed" | "missing" | "update_available" | "unknown";
    installedVersion: string | null;
    latestVersion: string | null;
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

  type DesktopBrowserWorkspaceState = {
    sessionGroupId: string;
    url: string;
    title: string;
    canGoBack: boolean;
    canGoForward: boolean;
    loading: boolean;
    devToolsOpen: boolean;
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
    loginCodexWithChatgpt: () => Promise<string>;
    getCodingToolStatuses: () => Promise<DesktopCodingToolStatus[]>;
    installOrUpdateCodingTool: (toolId: string) => Promise<DesktopCodingToolStatus>;
    getBridgeStatus: () => Promise<DesktopBridgeConnectionStatus>;
    getBridgeInfo: () => Promise<DesktopBridgeInfo>;
    setBridgeLabel: (label: string) => Promise<DesktopBridgeInfo>;
    setBridgeAuthContext: (organizationId: string | null) => Promise<boolean>;
    onBridgeStatus: (callback: (status: DesktopBridgeConnectionStatus) => void) => () => void;
    onMenuCommand?: (callback: (command: string) => void) => () => void;
    activateBrowser: (sessionGroupId: string) => Promise<DesktopBrowserWorkspaceState>;
    hideBrowser: (sessionGroupId: string) => Promise<void>;
    setBrowserBounds: (input: {
      sessionGroupId: string;
      bounds: { x: number; y: number; width: number; height: number };
    }) => Promise<void>;
    navigateBrowser: (sessionGroupId: string, url: string) => Promise<DesktopBrowserWorkspaceState>;
    goBrowserBack: (sessionGroupId: string) => Promise<DesktopBrowserWorkspaceState>;
    goBrowserForward: (sessionGroupId: string) => Promise<DesktopBrowserWorkspaceState>;
    reloadBrowser: (sessionGroupId: string) => Promise<DesktopBrowserWorkspaceState>;
    toggleBrowserDevTools: (sessionGroupId: string) => Promise<DesktopBrowserWorkspaceState>;
    onBrowserWorkspaceState: (callback: (state: unknown) => void) => () => void;
  }

  interface Window {
    trace?: TraceElectronBridge;
  }
}

export {};
