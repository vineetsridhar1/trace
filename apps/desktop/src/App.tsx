import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Workspace,
  Channel,
  ChannelType,
  LocalChannelConfig,
  MiddlePanelView,
  PullRequest,
  TicketStatus,
} from "./types";
import { gql } from "@apollo/client";
import { WORKSPACE_FIELDS } from "./graphql/fragments";
import {
  useUpdateWorkspaceStatusMutation,
  useDeleteWorkspaceMutation,
  useSetWorkspacePrUrlMutation,
} from "./__generated__/App.generated";
import { useCreateWorkspaceMutation } from "./hooks/__generated__/useAgentMessageActions.generated";
import { useWorkspaceSync } from "./hooks/useWorkspaceSync";
import { useThreadSync } from "./hooks/useThreadSync";
import { usePanelResize } from "./hooks/usePanelResize";
import { useChannelSubscriptions } from "./hooks/useChannelSubscriptionsV2";
import { useChannelMessageNotifications } from "./hooks/useChannelMessageNotifications";
import { useTerminalInit } from "./hooks/useTerminalInit";
import { useWorkspaceActions } from "./hooks/useAgentWorkspaceActions";
import { useStuckWorkspaceReconciliation } from "./hooks/useStuckWorkspaceReconciliation";
import { useSyncPolling } from "./hooks/useSyncPolling";
import { useKanbanSync } from "./hooks/useKanbanSync";
import { useAiChatSync } from "./hooks/useAiChatSync";
import { useProductDocActions } from "./hooks/useProductDocActions";
import { ChannelProvider, useChannelContext } from "./context/ChannelContext";
import { useAuth } from "./context/AuthContext";
import { ChannelPanel } from "./components/ChannelPanel";
import { ContentTabBar } from "./components/ContentTabBar";
import { MessagePanel } from "./components/MessagePanel";
import { ThreadPanel } from "./components/ThreadPanel";
import { JoinChannelModal } from "./components/JoinChannelModal";
import { CreateChannelModal } from "./components/CreateChannelModal";
import { CreateServerModal } from "./components/CreateServerModal";
import { ProductDocModal } from "./components/ProductDocModal";
import { NewWorkspaceModal } from "./components/NewWorkspaceModal";
import { SettingsPage } from "./components/SettingsPage";
import { ProductDocView } from "./components/ProductDocView";
import { AiChatPanel } from "./components/AiChatPanel";
import { ChannelTerminalTab } from "./components/ChannelTerminalTab";
import { ShortcutHelpDialog } from "./components/ShortcutHelpDialog";
import { CommandPalette } from "./components/CommandPalette";
import { Toaster, toast } from "sonner";
import { FiCheckCircle, FiGitMerge, FiAlertCircle } from "react-icons/fi";

// Zustand stores
import { useWorkspaceStore } from "./stores/workspaceStore";
import { useThreadStore } from "./stores/threadStore";
import { useTerminalStore } from "./stores/terminalStore";
import { useKanbanStore } from "./stores/kanbanStore";
import {
  useAppUIStore,
  isViewValidForChannel,
  getDefaultViewForChannel,
} from "./stores/appUIStore";
import { useAgentRunStore } from "./stores/agentRunStore";
import { usePanelLayoutStore, hasViewInTree } from "./stores/panelLayoutStore";
import { useSyncStore } from "./stores/syncStore";
import { useTabStore, TAB_TYPE_TO_VIEW } from "./stores/tabStore";
import type { GlobalTabType } from "./stores/tabStore";
import { useShortcuts } from "./hooks/useShortcuts";
import { useShortcutContextSync } from "./hooks/useShortcutContextSync";
import { useDefaultShortcuts } from "./hooks/useDefaultShortcuts";
import {
  usePresenceReporter,
  usePresenceSubscription,
} from "./hooks/usePresence";
import { usePresenceStore } from "./stores/presenceStore";
import { useOrchestratorSubscription } from "./hooks/useOrchestratorSubscription";
import { ExpandableText } from "./components/thread-events/ExpandableText";
import { useGetWorkspaceLazyQuery } from "./components/__generated__/ThreadLinkPreview.generated";

const GQL_UPDATE_WORKSPACE_STATUS = gql`
  mutation UpdateWorkspaceStatus(
    $channelId: ID!
    $workspaceId: ID!
    $status: String!
  ) {
    updateWorkspaceStatus(
      channelId: $channelId
      workspaceId: $workspaceId
      status: $status
    ) {
      ...WorkspaceFields
    }
  }
  ${WORKSPACE_FIELDS}
`;

const GQL_DELETE_WORKSPACE = gql`
  mutation DeleteWorkspace($channelId: ID!, $workspaceId: ID!) {
    deleteWorkspace(channelId: $channelId, workspaceId: $workspaceId)
  }
`;

const GQL_SET_WORKSPACE_PR_URL = gql`
  mutation SetWorkspacePrUrl(
    $channelId: ID!
    $workspaceId: ID!
    $prUrl: String!
  ) {
    setWorkspacePrUrl(
      channelId: $channelId
      workspaceId: $workspaceId
      prUrl: $prUrl
    )
  }
`;


export default function App() {
  return (
    <ChannelProvider>
      <AppContent />
    </ChannelProvider>
  );
}

function AppContent() {
  const {
    servers,
    activeServerId,
    activeServer,
    switchServer,
    refreshServers,
    enrichedChannels,
    serverChannels,
    activeChannelId,
    enrichedActiveChannel,
    switchChannel,
    refreshChannels,
    localConfigs,
    getLocalConfig,
    setLocalConfig,
    updateChannelSettings,
    deleteChannel,
  } = useChannelContext();

  // ─── Zustand store state ───────────────────────────────────────────
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const workspacesLoading = useWorkspaceStore((s) => s.loading);
  const attentionWorkspaceIds = useWorkspaceStore(
    (s) => s.attentionWorkspaceIds,
  );
  const mergedCount = useWorkspaceStore((s) => s.mergedCount);
  const mergedWorkspacesLoaded = useWorkspaceStore(
    (s) => s.mergedWorkspacesLoaded,
  );
  const mergedWorkspacesLoading = useWorkspaceStore(
    (s) => s.mergedWorkspacesLoading,
  );

  const selectedWorkspaceId = useThreadStore((s) => s.selectedWorkspaceId);

  const workspacesWithRunningProcesses = useTerminalStore(
    (s) => s.workspacesWithRunningProcesses,
  );

  const kanbanColumns = useKanbanStore((s) => s.columns);
  const kanbanLoading = useKanbanStore((s) => s.loading);

  const middlePanelView = useAppUIStore((s) => s.middlePanelView);
  const channelWidth = useAppUIStore((s) => s.channelWidth);
  const isFullscreen = useAppUIStore((s) => s.isFullscreen);
  const showSettings = useAppUIStore((s) => s.showSettings);
  const joinChannelId = useAppUIStore((s) => s.joinChannelId);
  const createChannelType = useAppUIStore((s) => s.createChannelType);
  const showCreateServer = useAppUIStore((s) => s.showCreateServer);
  const showProductDocModal = useAppUIStore((s) => s.showProductDocModal);
  const showNewWorkspaceModal = useAppUIStore((s) => s.showNewWorkspaceModal);
  const activeProductDocId = useAppUIStore((s) => s.activeProductDocId);
  const activeAiChatId = useAppUIStore((s) => s.activeAiChatId);
  const aiChats = useAppUIStore((s) => s.aiChats);
  const dragging = useAppUIStore((s) => s.dragging);
  const mobileDrawerOpen = useAppUIStore((s) => s.mobileDrawerOpen);

  const activeRunWorkspaceIds = useAgentRunStore(
    (s) => s.activeRunWorkspaceIds,
  );

  const { user: authUser } = useAuth();
  const authUserIdRef = useRef<string | null>(null);
  authUserIdRef.current = authUser?.id ?? null;

  // ─── Stable channel ref for callbacks ──────────────────────────────
  const activeChannelRef = useRef<Channel | null>(null);
  activeChannelRef.current = enrichedActiveChannel;
  const dismissTransientCenterView = useCallback(() => {
    const channelId = activeChannelRef.current?.id;
    const currentView = useAppUIStore.getState().middlePanelView;
    if (!channelId) return;
    if (currentView === 'workspaces' || currentView === 'board') {
      useAppUIStore.getState().setChannelView(channelId, 'chat');
    }
  }, []);

  const getChannelRepoPath = useCallback(
    () => activeChannelRef.current?.localRepoPath ?? "",
    [],
  );
  const getChannelBaseBranch = useCallback(
    () => activeChannelRef.current?.baseBranch ?? "main",
    [],
  );
  const getChannelTeardownCommands = useCallback((): string[] | undefined => {
    const script = activeChannelRef.current?.teardownScript;
    if (!script) return undefined;
    const cmds = script.split("\n").map((l) => l.trim()).filter(Boolean);
    return cmds.length > 0 ? cmds : undefined;
  }, []);
  const getActiveChannelId = useCallback(
    () => activeChannelId,
    [activeChannelId],
  );

  // ─── Bridge hooks (GraphQL → stores) ──────────────────────────────
  const { refreshWorkspaces, loadMergedWorkspaces } = useWorkspaceSync();
  const { fetchBoard, moveTicket } = useKanbanSync();
  const {
    fetchAiChats,
    createAiChat,
    deleteAiChat: deleteAiChatMutation,
  } = useAiChatSync();

  // Thread sync — registers sync actions on threadStore
  useThreadSync(getActiveChannelId, getChannelRepoPath, getChannelBaseBranch, getChannelTeardownCommands);

  // Terminal PTY exit listener
  useTerminalInit();

  // Close tab via Cmd+W (intercepted in main process before-input-event).
  // If a terminal sub-tab is active, close that first; otherwise close the global tab.
  useEffect(() => {
    const cleanup = window.traceAPI.onCloseTab(() => {
      const { tabs, activeTabId: globalTabId } = useTabStore.getState();
      const globalTab = tabs.find((t) => t.id === globalTabId);

      // Check if the user is viewing a terminal sub-tab
      if (globalTab) {
        const isTerminalGlobalTab = globalTab.type === 'terminal';
        const isThreadWithTerminal =
          globalTab.type === 'thread' &&
          hasViewInTree(usePanelLayoutStore.getState().root, 'terminal');

        if (isTerminalGlobalTab || isThreadWithTerminal) {
          const { activeTabId: termTabId, terminals } = useTerminalStore.getState();
          if (termTabId) {
            const term = terminals.find((t) => t.terminalId === termTabId);
            if (term && !term.readOnly) {
              useTerminalStore.getState().killTerminal(termTabId);
              return;
            }
          }
        }
      }

      if (globalTabId) useTabStore.getState().closeTab(globalTabId);
    });
    return cleanup;
  }, []);

  // ─── Panel resize ─────────────────────────────────────────────────
  usePanelResize();

  // ─── Mutations ────────────────────────────────────────────────────
  const [executeUpdateWorkspaceStatus] = useUpdateWorkspaceStatusMutation();
  const [executeDeleteWorkspace] = useDeleteWorkspaceMutation();
  const [executeSetWorkspacePrUrl] = useSetWorkspacePrUrlMutation();
  const [executeCreateWorkspace] = useCreateWorkspaceMutation();
  const [pullingPRNumbers, setPullingPRNumbers] = useState<Set<number>>(
    new Set(),
  );
  // ─── Notification permission ──────────────────────────────────────
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      void Notification.requestPermission();
    }
  }, []);


  // ─── Detect available agents on mount ──────────────────────────────
  useEffect(() => {
    void (async () => {
      try {
        const result = await window.traceAPI.detectAgents();
        if (result.success && result.agents) {
          useAgentRunStore.getState().setDetectedAgents(result.agents);
        }
      } catch {
        // Detection failed — keep default fallback agents
      }
    })();
  }, []);

  // ─── Upsert + sync helper ─────────────────────────────────────────
  const upsertAndSyncWorkspace = useCallback((workspace: Workspace) => {
    useWorkspaceStore.getState().upsertWorkspace(workspace);
    useThreadStore.getState().syncSelectedWorkspace(workspace);
  }, []);

  // ─── Check worktree existence for merged workspaces ───────────────
  useEffect(() => {
    const repoPath = getChannelRepoPath();
    if (!repoPath || !window.traceAPI?.checkWorktreeExists) return;

    const mergedWorkspaces = workspaces.filter((ws) => ws.status === "merged");
    if (mergedWorkspaces.length === 0) {
      const prev = useWorkspaceStore.getState().worktreeWorkspaceIds;
      if (prev.size > 0)
        useWorkspaceStore.getState().setWorktreeWorkspaceIds(new Set());
      return;
    }

    let cancelled = false;
    void (async () => {
      const ids = new Set<string>();
      for (const ws of mergedWorkspaces) {
        try {
          const result = await window.traceAPI.checkWorktreeExists(
            ws.id,
            repoPath,
          );
          if (result.success && result.exists) ids.add(ws.id);
        } catch {
          /* ignore */
        }
      }
      if (!cancelled) useWorkspaceStore.getState().setWorktreeWorkspaceIds(ids);
    })();

    return () => {
      cancelled = true;
    };
  }, [workspaces, getChannelRepoPath]);

  // ─── Attention / notifications ────────────────────────────────────
  const recentToastsRef = useRef<Record<string, number>>({});
  const openWorkspaceRef = useRef<((ws: Workspace) => void) | null>(null);
  const handleNeedsAttention = useCallback(
    (
      workspaceId: string,
      reason:
        | "stopped"
        | "ask-user-question"
        | "completed"
        | "merged"
        | "needs_input",
    ) => {
      // Only glow for the current user's own workspaces
      const workspace = useWorkspaceStore
        .getState()
        .workspaces.find((item) => item.id === workspaceId);
      if (
        workspace &&
        authUserIdRef.current &&
        workspace.userId !== authUserIdRef.current
      )
        return;
      useWorkspaceStore.getState().addAttention(workspaceId);

      // In-app toast for non-stopped reasons
      if (reason !== "stopped") {
        const now = Date.now();
        const lastToast = recentToastsRef.current[workspaceId] ?? 0;
        if (now - lastToast >= 3000) {
          recentToastsRef.current[workspaceId] = now;
          const TOAST_CONFIG: Record<
            string,
            { title: string; icon: React.ReactNode }
          > = {
            completed: {
              title: "Chat completed",
              icon: <FiCheckCircle className="text-green-400" />,
            },
            merged: {
              title: "Branch merged",
              icon: <FiGitMerge className="text-purple-400" />,
            },
            needs_input: {
              title: "Input needed",
              icon: <FiAlertCircle className="text-yellow-400" />,
            },
            "ask-user-question": {
              title: "Input needed",
              icon: <FiAlertCircle className="text-yellow-400" />,
            },
          };
          const config = TOAST_CONFIG[reason] ?? {
            title: "Chat completed",
            icon: <FiCheckCircle className="text-green-400" />,
          };
          const ws = useWorkspaceStore
            .getState()
            .workspaces.find((item) => item.id === workspaceId);
          const description = ws?.preview || ws?.cliSession.cwd || workspaceId;
          toast(config.title, {
            description: <ExpandableText text={description} lineClamp={2} />,
            icon: config.icon,
            duration: 8000,
            action: {
              label: "View",
              onClick: () => {
                const freshWs = useWorkspaceStore
                  .getState()
                  .workspaces.find((item) => item.id === workspaceId);
                if (freshWs) openWorkspaceRef.current?.(freshWs);
              },
            },
          });
        }
      }

      if (
        !document.hasFocus() &&
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        const NOTIFICATION_TITLES: Record<string, string> = {
          "ask-user-question": "Input needed",
          needs_input: "Input needed",
          merged: "Branch merged",
        };
        const title = NOTIFICATION_TITLES[reason] ?? "Chat completed";
        const workspace = useWorkspaceStore
          .getState()
          .workspaces.find((item) => item.id === workspaceId);
        const body =
          workspace?.preview || workspace?.cliSession.cwd || workspaceId;
        const notification = new Notification(title, { body });
        notification.onclick = () => {
          void window.traceAPI.focusWindow();
        };
      }
    },
    [],
  );

  // ─── Update workspace status mutation ─────────────────────────────
  const updateWorkspaceStatus = useCallback(
    async (workspaceId: string, status: TicketStatus) => {
      if (!activeChannelId) return;
      try {
        const { data } = await executeUpdateWorkspaceStatus({
          variables: { channelId: activeChannelId, workspaceId, status },
        });
        if (!data) return;
        upsertAndSyncWorkspace(data.updateWorkspaceStatus as Workspace);
      } catch {
        console.error("Failed to update workspace status");
      }
    },
    [activeChannelId, executeUpdateWorkspaceStatus, upsertAndSyncWorkspace],
  );

  // ─── Persist PR URL mutation ─────────────────────────────────────
  const persistPrUrl = useCallback(
    async (workspaceId: string, prUrl: string) => {
      if (!activeChannelId) return;
      try {
        await executeSetWorkspacePrUrl({
          variables: { channelId: activeChannelId, workspaceId, prUrl },
        });
        useKanbanStore.getState().setTicketWorkspacePrUrl(workspaceId, prUrl);
      } catch {
        // Silent — best-effort persistence
      }
    },
    [activeChannelId, executeSetWorkspacePrUrl],
  );

  // ─── Sync polling (main branch + PR statuses) ───────────────────
  const workspacesRef = useRef(workspaces);
  workspacesRef.current = workspaces;

  const handleWorkspaceMerged = useCallback(
    (workspaceId: string) => {
      const repoPath = getChannelRepoPath();
      if (!repoPath) return;

      void window.traceAPI
        .autoDeleteCleanWorktree(workspaceId, repoPath, getChannelTeardownCommands())
        .then((result) => {
          if (result.success && result.deleted) {
            void window.traceAPI.releasePorts(workspaceId);
            useWorkspaceStore.getState().removeWorktreeWorkspaceId(workspaceId);
            if (workspaceId === useThreadStore.getState().selectedWorkspaceId) {
              useThreadStore.getState().setHasWorktree(false);
            }
          }
        })
        .catch(() => {
          // Best-effort — silent failure
        });
    },
    [getChannelRepoPath, getChannelTeardownCommands],
  );

  const { triggerSync } = useSyncPolling({
    workspacesRef,
    getChannelId: getActiveChannelId,
    getRepoPath: getChannelRepoPath,
    getBaseBranch: getChannelBaseBranch,
    updateWorkspaceStatus,
    persistPrUrl,
    onWorkspaceMerged: handleWorkspaceMerged,
  });

  // ─── Open workspace handler ───────────────────────────────────────
  const handleOpenWorkspace = useCallback((workspace: Workspace) => {
    dismissTransientCenterView();
    useThreadStore.getState().syncActions.openThreadPanel(workspace);
    const ch = activeChannelRef.current;
    if (ch) {
      const label = workspace.ticketTitle || workspace.preview || 'Workspace';
      useTabStore.getState().openThreadTab(ch.id, ch.name, workspace.id, label);
    }
    useWorkspaceStore.getState().clearAttention(workspace.id);
  }, [dismissTransientCenterView]);
  openWorkspaceRef.current = handleOpenWorkspace;

  // ─── Fetch-and-open (handles merged/missing workspaces) ─────────────
  const [executeGetWorkspace] = useGetWorkspaceLazyQuery();

  const fetchAndOpenWorkspace = useCallback(
    async (workspaceId: string) => {
      const ws = useWorkspaceStore.getState().workspaces.find((w) => w.id === workspaceId);
      if (ws) {
        handleOpenWorkspace(ws);
        return;
      }
      try {
        const { data } = await executeGetWorkspace({
          variables: { id: workspaceId },
          fetchPolicy: 'network-only',
        });
        if (data?.workspace) {
          const fetched = data.workspace as Workspace;
          useWorkspaceStore.getState().upsertWorkspace(fetched);
          handleOpenWorkspace(fetched);
        }
      } catch (err) {
        console.error('[fetchAndOpenWorkspace] failed:', err);
      }
    },
    [executeGetWorkspace, handleOpenWorkspace],
  );

  const fetchAndOpenWorkspaceRef = useRef(fetchAndOpenWorkspace);
  fetchAndOpenWorkspaceRef.current = fetchAndOpenWorkspace;

  // ─── Workspace actions (registers on agentRunStore) ────────────────
  useWorkspaceActions({
    updateWorkspaceStatus,
    onWorkspaceCreated: handleOpenWorkspace,
  });

  // ─── Auto-create orchestrator when orchestrate mode is enabled ────
  const creatingOrchestratorRef = useRef(false);
  useEffect(() => {
    if (!enrichedActiveChannel?.orchestrateMode) return;
    if (workspacesLoading) return;
    const hasOrchestrator = workspaces.some(
      (w) => w.isOrchestrator && w.channelId === activeChannelId,
    );
    if (hasOrchestrator) return;
    if (creatingOrchestratorRef.current) return;
    creatingOrchestratorRef.current = true;
    void useAgentRunStore.getState().workspaceActions.createOrchestrator().finally(() => {
      creatingOrchestratorRef.current = false;
    });
  }, [enrichedActiveChannel?.orchestrateMode, activeChannelId, workspacesLoading, workspaces]);

  // ─── Reconcile stuck workspace statuses on startup ────────────────
  useStuckWorkspaceReconciliation({
    workspaces,
    workspacesLoading,
    updateWorkspaceStatus,
  });

  // ─── Subscriptions ───────────────────────────────────────────────
  const reportAgentActivity = useCallback(
    (workspaceId: string, eventType: string, sessionId?: string) =>
      useThreadStore
        .getState()
        .syncActions.reportAgentActivity(workspaceId, eventType, sessionId),
    [],
  );

  const autoRunRef = useRef<
    ((workspaceId: string, runConfig: unknown) => void) | null
  >(null);
  const autoReviewRef = useRef<
    ((workspaceId: string, runConfig: unknown) => void) | null
  >(null);
  useEffect(() => {
    autoRunRef.current = (workspaceId: string, runConfig: unknown) => {
      const config = runConfig as {
        prompt: string;
        model: string;
        effort: string;
        planMode: boolean;
        followUp?: boolean;
        interactionMode?: string;
      };
      void useAgentRunStore
        .getState()
        .workspaceActions.autoRunQueuedTicket(workspaceId, config);
    };
    autoReviewRef.current = (workspaceId: string, runConfig: unknown) => {
      const config = runConfig as {
        prompt: string;
        model: string;
        effort: string;
        planMode: boolean;
      };
      void useAgentRunStore
        .getState()
        .workspaceActions.reviewCompletedTicket(workspaceId, config);
    };
  }, []);

  const { subscriptionsActive } = useChannelSubscriptions({
    activeChannelId,
    reportAgentActivity,
    onNeedsAttention: handleNeedsAttention,
    onTicketReadyToRun: useCallback(
      (workspaceId: string, runConfig: unknown) => {
        autoRunRef.current?.(workspaceId, runConfig);
      },
      [],
    ),
    onTicketReadyForReview: useCallback(
      (workspaceId: string, runConfig: unknown) => {
        autoReviewRef.current?.(workspaceId, runConfig);
      },
      [],
    ),
    onWorkspaceCompleted: triggerSync,
    refreshWorkspaces,
  });

  // ─── Orchestrator trigger (server-scoped, works across channels) ──
  useOrchestratorSubscription({ activeServerId });

  // ─── Presence tracking ──────────────────────────────────────────
  usePresenceReporter(activeChannelId);
  usePresenceSubscription(activeChannelId);

  const switchChannelRef = useRef<((channelId: string) => void) | null>(null);
  const { unreadCounts } = useChannelMessageNotifications({
    activeServerId,
    activeChannelId,
    activeAiChatId,
    serverChannels,
      onNavigateToChannel: useCallback(
      (channelId: string) => switchChannelRef.current?.(channelId),
      [],
    ),
  });

  // ─── Computed values (early — needed by tab store) ────────────────
  const displayChannel = enrichedActiveChannel ?? serverChannels[0] ?? null;
  const panelTitle = displayChannel ? `# ${displayChannel.name}` : "";

  // ─── Global tab store ──────────────────────────────────────────────
  const currentChannelType = (displayChannel?.type ?? "channel") as ChannelType;
  const currentWsEnabled = displayChannel?.workspacesEnabled ?? false;
  const currentHasGithub = !!(displayChannel?.workspacesEnabled && displayChannel?.githubUrl);

  // Subscribe to global tab store reactively
  const globalTabs = useTabStore((s) => s.tabs);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const activeTab = useMemo(
    () => globalTabs.find((t) => t.id === activeTabId) ?? null,
    [globalTabs, activeTabId],
  );
  const transientCenterViewActive =
    middlePanelView === 'workspaces' || middlePanelView === 'board';
  const workspacesExpanded = middlePanelView === 'workspaces';

  // Sync middlePanelView when active tab changes (for view tabs).
  // Uses refs for activeChannelId so this only fires on tab changes,
  // NOT on channel changes (which would bounce back to the tab's channel).
  const activeChannelIdRef = useRef(activeChannelId);
  activeChannelIdRef.current = activeChannelId;

  // Consolidated tab-switch effect: sync view, ai chat, channel, and thread panel
  useEffect(() => {
    const tab = useTabStore.getState().tabs.find((t) => t.id === activeTabId);
    if (!tab) return;

    // Sync middlePanelView for view-type tabs
    const viewForTab = TAB_TYPE_TO_VIEW[tab.type];
    if (viewForTab) {
      const currentView = useAppUIStore.getState().middlePanelView;
      if (currentView !== viewForTab) {
        if (tab.channelId) {
          useAppUIStore.getState().setChannelView(tab.channelId, viewForTab);
        } else {
          useAppUIStore.getState().setMiddlePanelView(viewForTab);
        }
      }
      if (viewForTab === 'board' && tab.channelId) void fetchBoard(tab.channelId);
    }

    // Sync activeAiChatId for sidebar highlighting
    if (tab.type === 'ai-chat' && tab.aiChatId) {
      useAppUIStore.getState().setActiveAiChatId(tab.aiChatId);
    } else {
      const currentAiChatId = useAppUIStore.getState().activeAiChatId;
      if (currentAiChatId) useAppUIStore.getState().setActiveAiChatId(null);
    }

    // Auto-switch channel if tab belongs to a different channel
    if (tab.channelId && tab.channelId !== activeChannelIdRef.current) {
      performChannelSwitchRef.current(tab.channelId);
      // Thread tabs: workspaces were just cleared by the channel switch, so use
      // the pending mechanism to open the thread once workspaces reload.
      if (tab.type === 'thread' && tab.workspaceId) {
        useAppUIStore.getState().setPendingThreadOpen({
          channelId: tab.channelId,
          workspaceId: tab.workspaceId,
        });
      }
    }

    // Re-activate thread when switching to a thread tab
    if (tab.type === 'thread' && tab.workspaceId) {
      void fetchAndOpenWorkspaceRef.current(tab.workspaceId);
    }
  }, [activeTabId, fetchBoard]);

  // ─── Channel/view switching ──────────────────────────────────────
  const handleOpenViewTab = useCallback(
    (viewType: GlobalTabType) => {
      if (!activeChannelId || !displayChannel) return;
      if (viewType === 'board') {
        const viewForTab = TAB_TYPE_TO_VIEW[viewType];
        if (viewForTab) {
          useAppUIStore.getState().setChannelView(activeChannelId, viewForTab);
          if (viewForTab === 'board') void fetchBoard(activeChannelId);
        }
        return;
      }
      if (viewType === 'terminal') {
        dismissTransientCenterView();
        useTabStore.getState().openTerminalTab(activeChannelId, displayChannel.name);
        return;
      }
      useTabStore.getState().openViewTab(activeChannelId, displayChannel.name, viewType);
      const viewForTab = TAB_TYPE_TO_VIEW[viewType];
      if (viewForTab) {
        useAppUIStore.getState().setChannelView(activeChannelId, viewForTab);
        if (viewForTab === 'board') void fetchBoard(activeChannelId);
      }
    },
    [activeChannelId, dismissTransientCenterView, displayChannel, fetchBoard],
  );

  const handleMoveTicket = useCallback(
    (ticketId: string, columnId: string, sortOrder: number) => {
      if (!activeChannelId) return;
      void moveTicket(activeChannelId, ticketId, columnId, sortOrder);
    },
    [activeChannelId, moveTicket],
  );

  const handleDeleteWorkspace = useCallback(
    async (workspaceId: string) => {
      if (!activeChannelId) return;
      if (!window.confirm("Delete this workspace?")) return;

      if (useThreadStore.getState().selectedWorkspaceId === workspaceId) {
        useThreadStore.getState().closeThreadPanel();
      }
      useTabStore.getState().closeTabsForWorkspace(workspaceId);

      try {
        await executeDeleteWorkspace({
          variables: { channelId: activeChannelId, workspaceId },
        });
        useWorkspaceStore.getState().removeWorkspace(workspaceId);
        useKanbanStore.getState().removeTicketByWorkspaceId(workspaceId);
        useTerminalStore.getState().killAllForWorkspace(workspaceId);
        usePanelLayoutStore.getState().clearSavedLayout(workspaceId);
        void window.traceAPI.releasePorts(workspaceId);
        void window.traceAPI.deleteWorktree(workspaceId, getChannelRepoPath(), getChannelTeardownCommands());
      } catch {
        console.error("Failed to delete workspace");
      }
    },
    [activeChannelId, executeDeleteWorkspace, getChannelRepoPath, getChannelTeardownCommands],
  );

  const handleMarkMerged = useCallback(
    async (workspaceId: string) => {
      await updateWorkspaceStatus(workspaceId, "merged");
    },
    [updateWorkspaceStatus],
  );

  const handleExpandMerged = useCallback(() => {
    if (activeChannelId) void loadMergedWorkspaces(activeChannelId);
  }, [activeChannelId, loadMergedWorkspaces]);

  const performChannelSwitch = useCallback(
    (channelId: string) => {
      const currentSelected = useThreadStore.getState().selectedWorkspaceId;
      if (currentSelected) void window.traceAPI.releasePorts(currentSelected);

      switchChannel(channelId);
      useKanbanStore.getState().clearBoard();
      useWorkspaceStore.getState().clearWorkspaces();
      useKanbanStore.getState().setLoading(true);
      useSyncStore.getState().reset();
      usePresenceStore.getState().clear();

      // Don't touch active tab or middlePanelView — the center content
      // stays on whatever tab the user already has open. Only the workspace
      // sidebar updates to reflect the new channel.
      useTerminalStore.getState().detachAll();
    },
    [switchChannel],
  );
  const performChannelSwitchRef = useRef(performChannelSwitch);
  performChannelSwitchRef.current = performChannelSwitch;

  const handleSwitchChannel = useCallback(
    (channelId: string) => {
      performChannelSwitch(channelId);
      useAppUIStore.getState().setMobileDrawerOpen(false);
    },
    [performChannelSwitch],
  );
  switchChannelRef.current = handleSwitchChannel;

  // ─── Thread link navigation (cross-channel support) ────────────────
  const handleOpenThreadLink = useCallback(
    (targetChannelId: string, workspaceId: string) => {
      if (targetChannelId === activeChannelId) {
        void fetchAndOpenWorkspace(workspaceId);
        return;
      }
      useAppUIStore
        .getState()
        .setPendingThreadOpen({ channelId: targetChannelId, workspaceId });
      performChannelSwitch(targetChannelId);
    },
    [activeChannelId, fetchAndOpenWorkspace, performChannelSwitch],
  );

  const handleJoinChannel = useCallback(
    async (config: LocalChannelConfig) => {
      const targetId = joinChannelId ?? activeChannelId;
      if (!targetId) return;
      try {
        await setLocalConfig(targetId, config);
        if (targetId !== activeChannelId) {
          performChannelSwitch(targetId);
        }
        useAppUIStore.getState().setJoinChannelId(null);
      } catch (err) {
        console.error("[App] Failed to save local config:", err);
      }
    },
    [joinChannelId, activeChannelId, setLocalConfig, performChannelSwitch],
  );

  const handleSwitchServer = useCallback(
    (serverId: string) => {
      if (serverId === activeServerId) {
        useAppUIStore
          .getState()
          .setChannelWidth(useAppUIStore.getState().channelWidth > 0 ? 0 : 220);
        return;
      }
      switchServer(serverId);
      useAppUIStore.getState().setChannelWidth(220);
      const firstChannel = enrichedChannels.find(
        (ch) => ch.serverId === serverId,
      );
      if (firstChannel) handleSwitchChannel(firstChannel.id);
    },
    [switchServer, enrichedChannels, handleSwitchChannel, activeServerId],
  );

  const handleSwitchAiChat = useCallback((chatId: string) => {
    dismissTransientCenterView();
    const chat = useAppUIStore.getState().aiChats.find((c) => c.id === chatId);
    useTabStore.getState().openAiChatTab(chatId, chat?.title ?? 'AI Chat');
    useAppUIStore.getState().setActiveAiChatId(chatId);
    useAppUIStore.getState().setChannelWidth(220);
  }, [dismissTransientCenterView]);

  const handleCreateAiChat = useCallback(async () => {
    if (!activeServerId) return;
    try {
      const chat = await createAiChat(activeServerId);
      if (chat) {
        dismissTransientCenterView();
        useTabStore.getState().openAiChatTab(chat.id, chat.title);
        useAppUIStore.getState().setActiveAiChatId(chat.id);
        useAppUIStore.getState().setChannelWidth(220);
      }
    } catch (err) {
      console.error("[App] handleCreateAiChat failed:", err);
    }
  }, [activeServerId, createAiChat, dismissTransientCenterView]);

  const {
    handleRunProductDoc,
    handleRunTechScope,
    handleRunTickets,
    handleRunReviewTickets,
    handleSwitchProductDocTab,
  } = useProductDocActions({
    activeChannelId,
    getChannelRepoPath,
    getChannelBaseBranch,
    onOpenWorkspace: handleOpenWorkspace,
    upsertAndSyncWorkspace,
  });

  const handleDeleteAiChat = useCallback(
    async (id: string) => {
      await deleteAiChatMutation(id);
      useTabStore.getState().closeTabsForAiChat(id);
      if (useAppUIStore.getState().activeAiChatId === id) {
        useAppUIStore.getState().setActiveAiChatId(null);
      }
    },
    [deleteAiChatMutation],
  );

  const handleDeleteWorktreeById = useCallback(
    async (workspaceId: string) => {
      const repoPath = getChannelRepoPath();
      if (!repoPath) return;

      const confirmed = window.confirm(
        "Delete this worktree? This removes local files for this workspace.",
      );
      if (!confirmed) return;

      useTerminalStore.getState().killAllForWorkspace(workspaceId);
      void window.traceAPI.releasePorts(workspaceId);
      useWorkspaceStore.getState().addDeletingWorktreeId(workspaceId);

      try {
        const result = await window.traceAPI.deleteWorktree(
          workspaceId,
          repoPath,
          getChannelTeardownCommands(),
        );
        if (!result.success) {
          console.error("Failed to delete worktree:", result.error);
          return;
        }
        useWorkspaceStore.getState().removeWorktreeWorkspaceId(workspaceId);
        if (workspaceId === useThreadStore.getState().selectedWorkspaceId) {
          useThreadStore.getState().setHasWorktree(false);
        }
      } catch (err) {
        console.error("Failed to delete worktree:", err);
      } finally {
        useWorkspaceStore.getState().removeDeletingWorktreeId(workspaceId);
      }
    },
    [getChannelRepoPath, getChannelTeardownCommands],
  );

  // ─── Pull PR into workspace ─────────────────────────────────────
  const handlePullPR = useCallback(
    async (pr: PullRequest) => {
      if (!activeChannelId) return;
      const repoPath = getChannelRepoPath();
      if (!repoPath) return;

      setPullingPRNumbers((prev) => new Set(prev).add(pr.number));

      let createdWorkspace: Workspace | null = null;
      try {
        // 1. Create workspace with PR title
        const { data } = await executeCreateWorkspace({
          variables: { channelId: activeChannelId, text: pr.title },
        });
        if (!data?.createWorkspace) {
          console.error("Failed to create workspace for PR");
          return;
        }
        const workspace = data.createWorkspace.workspace as Workspace;
        createdWorkspace = workspace;
        upsertAndSyncWorkspace(workspace);

        // 2. Checkout the PR branch into a worktree
        const setupScript = enrichedActiveChannel?.setupScript;
        const setupCommands = setupScript
          ? setupScript
              .split("\n")
              .map((l: string) => l.trim())
              .filter(Boolean)
          : [];
        const checkoutResult = await window.traceAPI.checkoutPullRequest(
          repoPath,
          pr.headRefName,
          workspace.id,
          setupCommands,
        );
        if (!checkoutResult.success) {
          throw new Error(checkoutResult.error || "Checkout failed");
        }

        // 3. Set PR URL on the workspace
        await executeSetWorkspacePrUrl({
          variables: {
            channelId: activeChannelId,
            workspaceId: workspace.id,
            prUrl: pr.url,
          },
        });
        useKanbanStore.getState().setTicketWorkspacePrUrl(workspace.id, pr.url);

        // 4. Switch to workspaces view and open the workspace
        handleOpenWorkspace(workspace);
        createdWorkspace = null; // success — don't clean up
      } catch (err) {
        console.error("Failed to pull PR:", err);
        // Clean up the workspace if it was created but checkout/setup failed
        if (createdWorkspace && activeChannelId) {
          try {
            await executeDeleteWorkspace({
              variables: {
                channelId: activeChannelId,
                workspaceId: createdWorkspace.id,
              },
            });
            useWorkspaceStore.getState().removeWorkspace(createdWorkspace.id);
          } catch {
            console.error(
              "Failed to clean up workspace after PR checkout failure",
            );
          }
        }
      } finally {
        setPullingPRNumbers((prev) => {
          const next = new Set(prev);
          next.delete(pr.number);
          return next;
        });
      }
    },
    [
      activeChannelId,
      enrichedActiveChannel,
      executeCreateWorkspace,
      executeDeleteWorkspace,
      executeSetWorkspacePrUrl,
      getChannelRepoPath,
      handleOpenWorkspace,
      upsertAndSyncWorkspace,
    ],
  );

  // ─── Channel-switch effects ──────────────────────────────────────
  useEffect(() => {
    if (activeChannelId) {
      void refreshWorkspaces(activeChannelId);
      void fetchBoard(activeChannelId);
      useTerminalStore.getState().reattach();
    }
  }, [activeChannelId, refreshWorkspaces, fetchBoard]);

  useEffect(() => {
    if (activeServerId) void fetchAiChats(activeServerId);
  }, [activeServerId, fetchAiChats]);

  useEffect(() => {
    const transientTabs = useTabStore
      .getState()
      .tabs.filter((tab) => tab.type === 'workspaces' || tab.type === 'board');
    for (const tab of transientTabs) {
      useTabStore.getState().closeTab(tab.id);
    }
  }, []);

  // Fallback polling when subscriptions are down
  useEffect(() => {
    const interval = setInterval(() => {
      if (!activeChannelId || subscriptionsActive) return;
      if (useWorkspaceStore.getState().mergedWorkspacesLoaded) {
        void loadMergedWorkspaces(activeChannelId);
      } else {
        void refreshWorkspaces(activeChannelId);
      }
      const selectedWs = useThreadStore.getState().selectedWorkspace;
      if (selectedWs)
        void useThreadStore
          .getState()
          .syncActions.loadSessionEvents(selectedWs);
    }, 10000);
    return () => clearInterval(interval);
  }, [
    activeChannelId,
    refreshWorkspaces,
    loadMergedWorkspaces,
    subscriptionsActive,
  ]);

  // On WS reconnection (false → true), catch up on any missed updates
  const prevSubscriptionsActive = useRef(subscriptionsActive);
  useEffect(() => {
    if (
      subscriptionsActive &&
      !prevSubscriptionsActive.current &&
      activeChannelId
    ) {
      if (useWorkspaceStore.getState().mergedWorkspacesLoaded) {
        void loadMergedWorkspaces(activeChannelId);
      } else {
        void refreshWorkspaces(activeChannelId);
      }
      void fetchBoard(activeChannelId);
    }
    prevSubscriptionsActive.current = subscriptionsActive;
  }, [
    subscriptionsActive,
    activeChannelId,
    refreshWorkspaces,
    loadMergedWorkspaces,
    fetchBoard,
  ]);

  // One-time initial view correction after channel data loads
  const initialViewCorrectedRef = useRef(false);
  useEffect(() => {
    if (initialViewCorrectedRef.current || !enrichedActiveChannel) return;
    initialViewCorrectedRef.current = true;

    const { channelViewMap, middlePanelView } = useAppUIStore.getState();
    const savedView = channelViewMap[enrichedActiveChannel.id];
    const channelType = enrichedActiveChannel.type;
    const wsEnabled = enrichedActiveChannel.workspacesEnabled ?? false;

    if (savedView && isViewValidForChannel(savedView, channelType, wsEnabled))
      return;

    const correctView = getDefaultViewForChannel(channelType, wsEnabled);
    if (correctView !== middlePanelView) {
      useAppUIStore
        .getState()
        .setChannelView(enrichedActiveChannel.id, correctView);
    }
  }, [enrichedActiveChannel]);

  // Auto-open thread panel after cross-channel navigation
  useEffect(() => {
    const pending = useAppUIStore.getState().pendingThreadOpen;
    if (
      !pending ||
      pending.channelId !== activeChannelId ||
      workspaces.length === 0
    )
      return;
    useAppUIStore.getState().setPendingThreadOpen(null);
    void fetchAndOpenWorkspaceRef.current(pending.workspaceId);
  }, [workspaces, activeChannelId]);

  // Sync terminal selection with workspace selection, killing idle PTYs on navigate away
  const prevTerminalWorkspaceRef = useRef<string | null>(null);
  const killIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const prevId = prevTerminalWorkspaceRef.current;
    prevTerminalWorkspaceRef.current = selectedWorkspaceId;

    // selectWorkspace is cheap (synchronous projection) — run immediately
    useTerminalStore.getState().selectWorkspace(selectedWorkspaceId);

    // Debounce the IPC kill-idle call so rapid navigation doesn't fire it for every intermediate workspace
    if (killIdleTimerRef.current) clearTimeout(killIdleTimerRef.current);
    if (prevId && prevId !== selectedWorkspaceId) {
      const idToKill = prevId;
      killIdleTimerRef.current = setTimeout(() => {
        // Staleness guard: only kill if the user hasn't navigated back
        if (useThreadStore.getState().selectedWorkspaceId === idToKill) return;
        void useTerminalStore.getState().killIdleForWorkspace(idToKill);
      }, 300);
    }
  }, [selectedWorkspaceId]);
  useEffect(() => {
    return () => {
      if (killIdleTimerRef.current) clearTimeout(killIdleTimerRef.current);
    };
  }, []);

  // ─── Keyboard shortcuts ─────────────────────────────────────────
  useShortcuts();
  useShortcutContextSync();
  useDefaultShortcuts({
    serverChannels,
    handleSwitchChannel,
    handleOpenWorkspace,
    handleCreateAiChat: useCallback(() => { void handleCreateAiChat(); }, [handleCreateAiChat]),
  });

  // ─── Settings / channel modals ───────────────────────────────────
  const joinChannel = useMemo(
    () =>
      enrichedChannels.find((channel) => channel.id === joinChannelId) ?? null,
    [enrichedChannels, joinChannelId],
  );

  const handleSaveChannelSettings = useCallback(
    async (
      channelId: string,
      channelData: {
        name?: string;
        workspacesEnabled?: boolean;
        teamIds?: string[];
        defaultSetupScript?: string | null;
        defaultRunScript?: string | null;
        defaultTeardownScript?: string | null;
        orchestrateMode?: boolean;
      },
      localCfg: LocalChannelConfig | null,
    ) => {
      await updateChannelSettings(channelId, channelData);
      if (localCfg) await setLocalConfig(channelId, localCfg);
      void refreshChannels();
    },
    [refreshChannels, updateChannelSettings, setLocalConfig],
  );

  const handleDeleteChannel = useCallback(
    async (channelId: string) => {
      const success = await deleteChannel(channelId);
      if (!success) return;
      if (activeChannelId === channelId) {
        const remaining = serverChannels.filter((ch) => ch.id !== channelId);
        if (remaining.length > 0) switchChannel(remaining[0].id);
      }
      void refreshChannels();
    },
    [
      deleteChannel,
      activeChannelId,
      serverChannels,
      switchChannel,
      refreshChannels,
    ],
  );

  // ─── Computed values ─────────────────────────────────────────────
  const needsJoin = !!(
    displayChannel?.workspacesEnabled &&
    displayChannel.githubUrl &&
    activeChannelId &&
    !localConfigs[activeChannelId]?.localRepoPath
  );

  const handleOpenJoinModal = useCallback(() => {
    if (activeChannelId)
      useAppUIStore.getState().setJoinChannelId(activeChannelId);
  }, [activeChannelId]);

  const handlePromptJoinChannel = useCallback((channelId: string) => {
    useAppUIStore.getState().setJoinChannelId(channelId);
  }, []);

  const teamProjects = useMemo(
    () =>
      displayChannel?.type === "team"
        ? serverChannels.filter(
            (ch) =>
              ch.type === "project" && ch.teamIds.includes(displayChannel.id),
          )
        : [],
    [displayChannel, serverChannels],
  );

  // ─── Stable callbacks for child components ─────────────────────
  const handleCreateServer = useCallback(
    () => useAppUIStore.getState().setShowCreateServer(true),
    [],
  );
  const handleCreateTeam = useCallback(
    () => useAppUIStore.getState().setCreateChannelType("team"),
    [],
  );
  const handleCreateProject = useCallback(
    () => useAppUIStore.getState().setCreateChannelType("project"),
    [],
  );
  const handleCreateChannel = useCallback(
    () => useAppUIStore.getState().setCreateChannelType("channel"),
    [],
  );
  const handleStartDragLeft = useCallback(
    () => useAppUIStore.getState().setDragging("left"),
    [],
  );
  const handleSelectTab = useCallback(
    (tabId: string) => {
      dismissTransientCenterView();
      useTabStore.getState().setActiveTab(tabId);
    },
    [dismissTransientCenterView],
  );
  const handleCloseTab = useCallback(
    (tabId: string) => useTabStore.getState().closeTab(tabId),
    [],
  );
  const handleCreateAiChatAction = useCallback(
    () => { void handleCreateAiChat(); },
    [handleCreateAiChat],
  );
  const handleDeleteAiChatAction = useCallback(
    (id: string) => { void handleDeleteAiChat(id); },
    [handleDeleteAiChat],
  );
  // ─── Render ──────────────────────────────────────────────────────
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-surface text-primary">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <ChannelPanel
          channels={serverChannels}
          activeChannelId={activeChannelId}
          channelWidth={isFullscreen ? 0 : channelWidth}
          dragging={dragging}
          servers={servers}
          activeServerId={activeServerId}
          activeServer={activeServer}
          onSwitchServer={handleSwitchServer}
          onCreateServer={handleCreateServer}
          unreadCounts={unreadCounts}
          localConfigs={localConfigs}
          onSwitchChannel={handleSwitchChannel}
          onJoinChannel={handlePromptJoinChannel}
          onCreateTeam={handleCreateTeam}
          onCreateProject={handleCreateProject}
          onCreateChannel={handleCreateChannel}
          onStartDrag={handleStartDragLeft}
          onOpenWorkspaceLink={handleOpenThreadLink}
          onOpenViewTab={handleOpenViewTab}
        />

        {/* Mobile drawer overlay */}
        <div
          className={`mobile-drawer-overlay ${mobileDrawerOpen ? 'visible' : ''}`}
          onClick={() => {
            useAppUIStore.getState().setMobileDrawerOpen(false);
          }}
        />

        {/* Center content area */}
        <div
          className="flex min-h-0 min-w-0 flex-col panel-animate"
          style={{ flex: "1 1 0%", overflow: "hidden" }}
        >
          {!isFullscreen && !activeProductDocId && !workspacesExpanded && (
            <ContentTabBar
              tabs={globalTabs}
              activeTabId={activeTabId}
              onSelectTab={handleSelectTab}
              onCloseTab={handleCloseTab}
              onCreateAiChat={handleCreateAiChatAction}
              aiChats={aiChats}
              activeAiChatId={activeAiChatId}
              onSwitchAiChat={handleSwitchAiChat}
              onDeleteAiChat={handleDeleteAiChatAction}
              channelType={currentChannelType}
              workspacesEnabled={currentWsEnabled}
              hasGithubUrl={currentHasGithub}
              hasRepoPath={!!enrichedActiveChannel?.localRepoPath}
              activeChannelId={activeChannelId}
              onOpenViewTab={handleOpenViewTab}
            />
          )}
          <div className="flex min-h-0 flex-1 flex-col">
            {activeProductDocId ? (
              <ProductDocView
                onBack={() => {
                  useAppUIStore.getState().setActiveProductDocId(null);
                  useAppUIStore.getState().setProductDocMode('prd');
                  useAppUIStore.getState().resetProductDocSessions();
                }}
                onGenerateTechScope={handleRunTechScope}
                onGenerateTickets={handleRunTickets}
                onReviewTickets={handleRunReviewTickets}
                onSwitchTab={handleSwitchProductDocTab}
              />
            ) : transientCenterViewActive ? (
              <MessagePanel
                panelTitle={panelTitle}
                channelId={activeChannelId}
                channelCreatedAt={enrichedActiveChannel?.createdAt ?? null}
                workspaces={workspaces}
                selectedWorkspaceId={selectedWorkspaceId}
                attentionWorkspaceIds={attentionWorkspaceIds}
                onOpenWorkspace={handleOpenWorkspace}
                onDeleteWorkspace={handleDeleteWorkspace}
                onMarkMerged={handleMarkMerged}
                middlePanelView={middlePanelView}
                kanbanColumns={kanbanColumns}
                kanbanLoading={kanbanLoading}
                onMoveTicket={handleMoveTicket}
                isFullscreen={isFullscreen || workspacesExpanded}
                teamProjects={teamProjects}
                onSwitchChannel={handleSwitchChannel}
                workspacesWithRunningProcesses={workspacesWithRunningProcesses}
                activeRunWorkspaceIds={activeRunWorkspaceIds}
                needsJoin={needsJoin}
                onJoinChannel={handleOpenJoinModal}
                onOpenThreadLink={handleOpenThreadLink}
                repoPath={enrichedActiveChannel?.localRepoPath}
                onPullPR={handlePullPR}
                pullingPRNumbers={pullingPRNumbers}
                workspacesLoading={workspacesLoading}
                mergedCount={mergedCount}
                mergedWorkspacesLoaded={mergedWorkspacesLoaded}
                mergedWorkspacesLoading={mergedWorkspacesLoading}
                onExpandMerged={handleExpandMerged}
              />
            ) : activeTab?.type === 'thread' ? (
              <ThreadPanel asMainContent />
            ) : activeTab?.type === 'terminal' && activeTab.channelId && enrichedActiveChannel?.localRepoPath ? (
              <ChannelTerminalTab
                channelId={activeTab.channelId}
                repoPath={enrichedActiveChannel.localRepoPath}
              />
            ) : activeTab?.type === 'ai-chat' && activeTab.aiChatId ? (
              <AiChatPanel
                chatId={activeTab.aiChatId}
                chatTitle={
                  aiChats.find((c) => c.id === activeTab.aiChatId)?.title ??
                  "AI Chat"
                }
              />
            ) : activeTab ? (
              <MessagePanel
                panelTitle={panelTitle}
                channelId={activeChannelId}
                channelCreatedAt={enrichedActiveChannel?.createdAt ?? null}
                workspaces={workspaces}
                selectedWorkspaceId={selectedWorkspaceId}
                attentionWorkspaceIds={attentionWorkspaceIds}
                onOpenWorkspace={handleOpenWorkspace}
                onDeleteWorkspace={handleDeleteWorkspace}
                onMarkMerged={handleMarkMerged}
                middlePanelView={middlePanelView}
                kanbanColumns={kanbanColumns}
                kanbanLoading={kanbanLoading}
                onMoveTicket={handleMoveTicket}
                isFullscreen={isFullscreen || workspacesExpanded}
                teamProjects={teamProjects}
                onSwitchChannel={handleSwitchChannel}
                workspacesWithRunningProcesses={workspacesWithRunningProcesses}
                activeRunWorkspaceIds={activeRunWorkspaceIds}
                needsJoin={needsJoin}
                onJoinChannel={handleOpenJoinModal}
                onOpenThreadLink={handleOpenThreadLink}
                repoPath={enrichedActiveChannel?.localRepoPath}
                onPullPR={handlePullPR}
                pullingPRNumbers={pullingPRNumbers}
                workspacesLoading={workspacesLoading}
                mergedCount={mergedCount}
                mergedWorkspacesLoaded={mergedWorkspacesLoaded}
                mergedWorkspacesLoading={mergedWorkspacesLoading}
                onExpandMerged={handleExpandMerged}
              />
            ) : (
              <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted">
                Open a tab to get started
              </div>
            )}
          </div>
        </div>

      </div>

      {showSettings && (
        <SettingsPage
          onDeleteChannel={handleDeleteChannel}
          onSaveChannelSettings={handleSaveChannelSettings}
        />
      )}

      {joinChannel && (
        <JoinChannelModal
          channel={joinChannel}
          onJoined={handleJoinChannel}
          onCancel={() => useAppUIStore.getState().setJoinChannelId(null)}
        />
      )}

      {createChannelType && (
        <CreateChannelModal
          serverId={activeServerId}
          channelType={createChannelType}
          teams={serverChannels.filter((ch) => ch.type === "team")}
          onClose={() => useAppUIStore.getState().setCreateChannelType(null)}
          onCreated={() => {
            useAppUIStore.getState().setCreateChannelType(null);
            void refreshChannels();
          }}
          onLocalConfigSave={setLocalConfig}
        />
      )}

      {showCreateServer && (
        <CreateServerModal
          onClose={() => useAppUIStore.getState().setShowCreateServer(false)}
          onCreated={(server) => {
            useAppUIStore.getState().setShowCreateServer(false);
            void refreshServers();
            void refreshChannels();
            switchServer(server.id);
            if (server.channels.length > 0)
              handleSwitchChannel(server.channels[0].id);
          }}
        />
      )}

      {showProductDocModal && (
        <ProductDocModal
          hasRepo={!!enrichedActiveChannel?.localRepoPath}
          onClose={() =>
            useAppUIStore.getState().setShowProductDocModal(false)
          }
          onRun={(prompt) => {
            void handleRunProductDoc(prompt);
          }}
        />
      )}

      {showNewWorkspaceModal && <NewWorkspaceModal />}

      <ShortcutHelpDialog />
      <CommandPalette
        serverChannels={serverChannels}
        onSwitchChannel={handleSwitchChannel}
        onOpenThreadLink={handleOpenThreadLink}
      />
      <Toaster
        position="bottom-right"
        theme="dark"
        closeButton
        toastOptions={{ duration: 5000 }}
      />
    </div>
  );
}
