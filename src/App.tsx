import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { Workspace, Channel, ChannelType, LocalChannelConfig, MiddlePanelView, TicketStatus } from './types';
import { gql } from '@apollo/client';
import { WORKSPACE_FIELDS } from './graphql/fragments';
import { useUpdateWorkspaceStatusMutation, useDeleteWorkspaceMutation, useSetTicketDependenciesMutation, useRemoveTicketDependencyMutation, useUpdateQueuedRunConfigMutation } from './__generated__/App.generated';
import { buildSessionNodes } from './utils';
import { useWorkspaceSync } from './hooks/useWorkspaceSync';
import { useThreadSync } from './hooks/useThreadSync';
import { useThreadScroll } from './hooks/useThreadScroll';
import { usePanelResize } from './hooks/usePanelResize';
import { useChannelSubscriptions } from './hooks/useChannelSubscriptionsV2';
import { useChannelMessageNotifications } from './hooks/useChannelMessageNotifications';
import { useTerminalInit } from './hooks/useTerminalInit';
import { useClaudeWorkspaceActions } from './hooks/useClaudeWorkspaceActions';
import { usePRPolling } from './hooks/usePRPolling';
import { useKanbanSync } from './hooks/useKanbanSync';
import { useAiChatSync } from './hooks/useAiChatSync';
import { ClaudeActionsProvider } from './context/ClaudeActionsContext';
import { ChannelProvider, useChannelContext } from './context/ChannelContext';
import { ThreadProvider } from './context/ThreadContext';
import { ChannelPanel } from './components/ChannelPanel';
import { ChannelTopBar } from './components/ChannelTopBar';
import { MessagePanel } from './components/MessagePanel';
import { ChannelSettingsModal } from './components/ChannelSettingsModal';
import { CreateChannelModal } from './components/CreateChannelModal';
import { CreateServerModal } from './components/CreateServerModal';
import { ServerRail } from './components/ServerRail';
import { AiChatPanel } from './components/AiChatPanel';

// Zustand stores
import { useWorkspaceStore } from './stores/workspaceStore';
import { useThreadStore } from './stores/threadStore';
import { useTerminalStore } from './stores/terminalStore';
import { useKanbanStore } from './stores/kanbanStore';
import { useAppUIStore } from './stores/appUIStore';
import { useClaudeRunStore } from './stores/claudeRunStore';

const GQL_UPDATE_WORKSPACE_STATUS = gql`
  mutation UpdateWorkspaceStatus($channelId: ID!, $workspaceId: ID!, $status: String!) {
    updateWorkspaceStatus(channelId: $channelId, workspaceId: $workspaceId, status: $status) {
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

const GQL_SET_TICKET_DEPENDENCIES = gql`
  mutation SetTicketDependencies($channelId: ID!, $workspaceId: ID!, $dependsOnWorkspaceIds: [ID!]!, $runConfig: JSON!) {
    setTicketDependencies(channelId: $channelId, workspaceId: $workspaceId, dependsOnWorkspaceIds: $dependsOnWorkspaceIds, runConfig: $runConfig) {
      ...WorkspaceFields
    }
  }
  ${WORKSPACE_FIELDS}
`;

const GQL_REMOVE_TICKET_DEPENDENCY = gql`
  mutation RemoveTicketDependency($channelId: ID!, $workspaceId: ID!, $dependsOnWorkspaceId: ID!) {
    removeTicketDependency(channelId: $channelId, workspaceId: $workspaceId, dependsOnWorkspaceId: $dependsOnWorkspaceId)
  }
`;

const GQL_UPDATE_QUEUED_RUN_CONFIG = gql`
  mutation UpdateQueuedRunConfig($workspaceId: ID!, $runConfig: JSON!) {
    updateQueuedRunConfig(workspaceId: $workspaceId, runConfig: $runConfig)
  }
`;

const SERVER_RAIL_WIDTH = 60;

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
  const attentionWorkspaceIds = useWorkspaceStore((s) => s.attentionWorkspaceIds);
  const worktreeWorkspaceIds = useWorkspaceStore((s) => s.worktreeWorkspaceIds);
  const deletingWorktreeIds = useWorkspaceStore((s) => s.deletingWorktreeIds);

  const selectedWorkspaceId = useThreadStore((s) => s.selectedWorkspaceId);
  const activeSessionId = useThreadStore((s) => s.activeSessionId);
  const sessions = useThreadStore((s) => s.sessions);
  const sessionEvents = useThreadStore((s) => s.sessionEvents);
  const sessionStatus = useThreadStore((s) => s.sessionStatus);
  const threadWidth = useThreadStore((s) => s.threadWidth);
  const expandedReadGroupIds = useThreadStore((s) => s.expandedReadGroupIds);
  const expandedTurnGroupIds = useThreadStore((s) => s.expandedTurnGroupIds);
  const hasWorktree = useThreadStore((s) => s.hasWorktree);
  const deletingWorktree = useThreadStore((s) => s.deletingWorktree);
  const hasMoreEvents = useThreadStore((s) => s.sessionTotal > s.sessionEvents.length);
  const loadingOlderEvents = useThreadStore((s) => s.loadingOlderEvents);

  const terminalList = useTerminalStore((s) => s.terminals);
  const activeTabId = useTerminalStore((s) => s.activeTabId);
  const terminalsCwd = useTerminalStore((s) => s.cwd);
  const terminalsInitialized = useTerminalStore((s) => s.initialized);
  const allTerminalEntries = useTerminalStore((s) => s.allTerminalEntries);
  const runningPtyIds = useTerminalStore((s) => s.runningPtyIds);
  const workspacesWithRunningProcesses = useTerminalStore((s) => s.workspacesWithRunningProcesses);

  const kanbanColumns = useKanbanStore((s) => s.columns);
  const kanbanLoading = useKanbanStore((s) => s.loading);

  const middlePanelView = useAppUIStore((s) => s.middlePanelView);
  const channelWidth = useAppUIStore((s) => s.channelWidth);
  const isFullscreen = useAppUIStore((s) => s.isFullscreen);
  const settingsChannelId = useAppUIStore((s) => s.settingsChannelId);
  const createChannelType = useAppUIStore((s) => s.createChannelType);
  const showCreateServer = useAppUIStore((s) => s.showCreateServer);
  const activeAiChatId = useAppUIStore((s) => s.activeAiChatId);
  const aiChats = useAppUIStore((s) => s.aiChats);

  const pendingRunWorkspaceId = useClaudeRunStore((s) => s.pendingRunWorkspaceId);
  const pendingRunInitialPrompt = useClaudeRunStore((s) => s.pendingRunInitialPrompt);
  const selectedModel = useClaudeRunStore((s) => s.selectedModel);
  const selectedEffort = useClaudeRunStore((s) => s.selectedEffort);
  const activeRunWorkspaceIds = useClaudeRunStore((s) => s.activeRunWorkspaceIds);

  // ─── Store actions (stable references) ─────────────────────────────
  const setThreadWidth = useThreadStore((s) => s.setThreadWidth);
  const closeThreadPanel = useThreadStore((s) => s.closeThreadPanel);
  const toggleReadGroup = useThreadStore((s) => s.toggleReadGroup);
  const toggleTurnGroup = useThreadStore((s) => s.toggleTurnGroup);

  const setActiveTabId = useTerminalStore((s) => s.setActiveTabId);
  const killTerminalsForWorkspace = useTerminalStore((s) => s.killAllForWorkspace);
  const killTerminal = useTerminalStore((s) => s.killTerminal);
  const addTerminal = useTerminalStore((s) => s.addTerminal);

  // ─── Stable channel ref for callbacks ──────────────────────────────
  const activeChannelRef = useRef<Channel | null>(null);
  activeChannelRef.current = enrichedActiveChannel;

  const getChannelRepoPath = useCallback(() => activeChannelRef.current?.localRepoPath ?? '', []);
  const getChannelBaseBranch = useCallback(() => activeChannelRef.current?.baseBranch ?? 'main', []);
  const getActiveChannelId = useCallback(() => activeChannelId, [activeChannelId]);

  // ─── Bridge hooks (GraphQL → stores) ──────────────────────────────
  const { refreshWorkspaces } = useWorkspaceSync();
  const { fetchBoard, moveTicket } = useKanbanSync();
  const { fetchAiChats, createAiChat, deleteAiChat: deleteAiChatMutation } = useAiChatSync();

  const threadSync = useThreadSync(getActiveChannelId, getChannelRepoPath, getChannelBaseBranch);
  const { loadSessionEvents, loadOlderEvents, switchSession, clearSession, deleteWorktree, openThreadPanel, reportClaudeActivity } = threadSync;

  // Terminal PTY exit listener
  useTerminalInit();

  const savedWidthsRef = useRef({ channel: 220, thread: 0 });

  // ─── Panel resize ─────────────────────────────────────────────────
  const setChannelWidth = useAppUIStore((s) => s.setChannelWidth);
  const { dragging, startDragging } = usePanelResize(
    useCallback((w: number) => useAppUIStore.getState().setChannelWidth(w), []),
    setThreadWidth,
    SERVER_RAIL_WIDTH,
  );

  // ─── Mutations ────────────────────────────────────────────────────
  const [executeUpdateWorkspaceStatus] = useUpdateWorkspaceStatusMutation();
  const [executeDeleteWorkspace] = useDeleteWorkspaceMutation();
  const [executeSetTicketDependencies] = useSetTicketDependenciesMutation();
  const [executeRemoveTicketDependency] = useRemoveTicketDependencyMutation();
  const [executeUpdateQueuedRunConfig] = useUpdateQueuedRunConfigMutation();

  // ─── Notification permission ──────────────────────────────────────
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  }, []);

  // ─── Upsert + sync helper ─────────────────────────────────────────
  const upsertAndSyncWorkspace = useCallback(
    (workspace: Workspace) => {
      useWorkspaceStore.getState().upsertWorkspace(workspace);
      useThreadStore.getState().syncSelectedWorkspace(workspace);
    },
    [],
  );

  // ─── Check worktree existence for merged workspaces ───────────────
  useEffect(() => {
    const repoPath = getChannelRepoPath();
    if (!repoPath || !window.traceAPI?.checkWorktreeExists) return;

    const mergedWorkspaces = workspaces.filter((ws) => ws.status === 'merged');
    if (mergedWorkspaces.length === 0) {
      const prev = useWorkspaceStore.getState().worktreeWorkspaceIds;
      if (prev.size > 0) useWorkspaceStore.getState().setWorktreeWorkspaceIds(new Set());
      return;
    }

    let cancelled = false;
    void (async () => {
      const ids = new Set<string>();
      for (const ws of mergedWorkspaces) {
        try {
          const result = await window.traceAPI.checkWorktreeExists(ws.id, repoPath);
          if (result.success && result.exists) ids.add(ws.id);
        } catch { /* ignore */ }
      }
      if (!cancelled) useWorkspaceStore.getState().setWorktreeWorkspaceIds(ids);
    })();

    return () => { cancelled = true; };
  }, [workspaces, getChannelRepoPath]);

  // ─── Attention / notifications ────────────────────────────────────
  const handleNeedsAttention = useCallback(
    (workspaceId: string, reason: 'stopped' | 'ask-user-question' | 'completed' | 'merged' | 'needs_input') => {
      useWorkspaceStore.getState().addAttention(workspaceId);

      if (!document.hasFocus() && 'Notification' in window && Notification.permission === 'granted') {
        const NOTIFICATION_TITLES: Record<string, string> = {
          'ask-user-question': 'Input needed',
          'needs_input': 'Input needed',
          'merged': 'Branch merged',
        };
        const title = NOTIFICATION_TITLES[reason] ?? 'Chat completed';
        const workspace = useWorkspaceStore.getState().workspaces.find((item) => item.id === workspaceId);
        const body = workspace?.preview || workspace?.cliSession.cwd || workspaceId;
        const notification = new Notification(title, { body });
        notification.onclick = () => { void window.traceAPI.focusWindow(); };
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
        console.error('Failed to update workspace status');
      }
    },
    [activeChannelId, executeUpdateWorkspaceStatus, upsertAndSyncWorkspace],
  );

  // ─── PR polling ──────────────────────────────────────────────────
  const workspacesRef = useRef(workspaces);
  workspacesRef.current = workspaces;
  const { triggerCheck: triggerPRCheck } = usePRPolling({
    workspacesRef,
    getChannelId: getActiveChannelId,
    updateWorkspaceStatus,
  });

  // ─── Claude actions ──────────────────────────────────────────────
  const getSetupCommands = useCallback((): string[] => {
    if (!enrichedActiveChannel?.setupScript) return [];
    return enrichedActiveChannel.setupScript.split('\n').map((l) => l.trim()).filter(Boolean);
  }, [enrichedActiveChannel]);

  const activeSystemInstructions = activeChannelId ? localConfigs[activeChannelId]?.systemInstructions : undefined;
  const getSystemInstructions = useCallback((): string | undefined => activeSystemInstructions, [activeSystemInstructions]);

  const handleOpenWorkspace = useCallback(
    (workspace: Workspace) => {
      resetScroll();
      openThreadPanel(workspace);
      useAppUIStore.getState().setMiddlePanelView('workspaces');
      useWorkspaceStore.getState().clearAttention(workspace.id);
    },
    [openThreadPanel],
  );

  const claudeActions = useClaudeWorkspaceActions({
    activeChannelId,
    onWorkspaceCreated: handleOpenWorkspace,
    loadSessionEvents,
    upsertWorkspace: upsertAndSyncWorkspace,
    updateWorkspaceStatus,
    getSetupCommands,
    getChannelRepoPath,
    getChannelBaseBranch,
    getSystemInstructions,
    clearSession,
  });

  // ─── Subscriptions ───────────────────────────────────────────────
  const autoRunRef = useRef<((workspaceId: string, runConfig: unknown) => void) | null>(null);
  useEffect(() => {
    autoRunRef.current = (workspaceId: string, runConfig: unknown) => {
      const config = runConfig as { prompt: string; model: string; effort: string; planMode: boolean };
      void claudeActions.autoRunQueuedTicket(workspaceId, config);
    };
  }, [claudeActions.autoRunQueuedTicket]);

  const { subscriptionsActive } = useChannelSubscriptions({
    activeChannelId,
    reportClaudeActivity,
    onNeedsAttention: handleNeedsAttention,
    onTicketReadyToRun: useCallback((workspaceId: string, runConfig: unknown) => {
      autoRunRef.current?.(workspaceId, runConfig);
    }, []),
    onWorkspaceCompleted: triggerPRCheck,
    refreshWorkspaces,
  });

  const { unreadCounts } = useChannelMessageNotifications({
    activeServerId,
    activeChannelId,
    activeAiChatId,
    serverChannels,
  });

  // ─── Derived state ───────────────────────────────────────────────
  const repoPath = enrichedActiveChannel?.localRepoPath ?? '';

  const isClaudeRunning = useMemo(() => {
    if (!selectedWorkspaceId) return false;
    if (activeRunWorkspaceIds.has(selectedWorkspaceId)) return true;
    if (!useClaudeRunStore.getState().isWorkspaceSpawned(selectedWorkspaceId)) return false;
    if (sessionStatus === 'empty') return false;
    const lastEvent = sessionEvents[sessionEvents.length - 1];
    if (lastEvent?.hookEventName === 'Stop') return false;
    return true;
  }, [selectedWorkspaceId, activeRunWorkspaceIds, sessionEvents, sessionStatus]);

  const sessionNodes = useMemo(() => buildSessionNodes(sessionEvents), [sessionEvents]);

  const selectedWorkspaceStatus: TicketStatus = useMemo(() => {
    const selected = workspaces.find((ws) => ws.id === selectedWorkspaceId);
    return (selected?.status ?? 'pending') as TicketStatus;
  }, [workspaces, selectedWorkspaceId]);

  const selectedWorkspaceQueuedRunConfig = useMemo(() => {
    const selected = workspaces.find((ws) => ws.id === selectedWorkspaceId);
    return selected?.queuedRunConfig ?? null;
  }, [workspaces, selectedWorkspaceId]);

  const selectedWorkspaceUserId = useMemo(() => {
    const selected = workspaces.find((ws) => ws.id === selectedWorkspaceId);
    return selected?.userId ?? null;
  }, [workspaces, selectedWorkspaceId]);

  const selectedTicket = useMemo(() => {
    if (!selectedWorkspaceId) return null;
    for (const col of kanbanColumns) {
      const found = col.tickets.find((t) => t.workspaceId === selectedWorkspaceId);
      if (found) return found;
    }
    return null;
  }, [kanbanColumns, selectedWorkspaceId]);

  const channelTickets = useMemo(
    () => kanbanColumns.flatMap((col) =>
      col.tickets.map((t) => ({
        workspaceId: t.workspaceId,
        title: t.title,
        status: t.workspace?.status ?? 'pending',
      })),
    ),
    [kanbanColumns],
  );

  // ─── Scroll ──────────────────────────────────────────────────────
  const {
    threadContentRef,
    showJumpToLatest,
    scrollThreadToBottom,
    onThreadScroll,
    resetScroll,
  } = useThreadScroll({
    sessionEvents,
    selectedWorkspaceId,
    hasMoreEvents,
    loadingOlderEvents,
    loadOlderEvents,
  });

  // ─── Channel/view switching ──────────────────────────────────────
  const handleSetView = useCallback(
    (view: MiddlePanelView) => {
      useAppUIStore.getState().setMiddlePanelView(view);
      if (view === 'board' && activeChannelId) void fetchBoard(activeChannelId);
    },
    [activeChannelId, fetchBoard],
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
      if (!window.confirm('Delete this workspace?')) return;

      if (useThreadStore.getState().selectedWorkspaceId === workspaceId) {
        useThreadStore.getState().closeThreadPanel();
      }

      try {
        await executeDeleteWorkspace({ variables: { channelId: activeChannelId, workspaceId } });
        useWorkspaceStore.getState().removeWorkspace(workspaceId);
        useTerminalStore.getState().killAllForWorkspace(workspaceId);
        void window.traceAPI.releasePorts(workspaceId);
        void window.traceAPI.deleteWorktree(workspaceId, getChannelRepoPath());
      } catch {
        console.error('Failed to delete workspace');
      }
    },
    [activeChannelId, executeDeleteWorkspace, getChannelRepoPath],
  );

  const handleSetTicketDependencies = useCallback(
    async (workspaceId: string, depIds: string[], runConfig: { prompt: string; model: string; effort: string; planMode: boolean }) => {
      if (!activeChannelId) return;
      try {
        const { data } = await executeSetTicketDependencies({
          variables: { channelId: activeChannelId, workspaceId, dependsOnWorkspaceIds: depIds, runConfig },
        });
        if (data?.setTicketDependencies) upsertAndSyncWorkspace(data.setTicketDependencies as Workspace);
      } catch {
        console.error('Failed to set ticket dependencies');
      }
    },
    [activeChannelId, executeSetTicketDependencies, upsertAndSyncWorkspace],
  );

  const handleRemoveTicketDependency = useCallback(
    async (workspaceId: string, dependsOnWorkspaceId: string) => {
      if (!activeChannelId) return;
      try {
        await executeRemoveTicketDependency({ variables: { channelId: activeChannelId, workspaceId, dependsOnWorkspaceId } });
      } catch {
        console.error('Failed to remove ticket dependency');
      }
    },
    [activeChannelId, executeRemoveTicketDependency],
  );

  const handleUpdateQueuedRunConfig = useCallback(
    async (workspaceId: string, runConfig: { prompt: string; model: string; effort: string; planMode: boolean }) => {
      try {
        await executeUpdateQueuedRunConfig({ variables: { workspaceId, runConfig } });
      } catch {
        console.error('Failed to update queued run config');
      }
    },
    [executeUpdateQueuedRunConfig],
  );

  const handleSwitchChannel = useCallback(
    (channelId: string) => {
      const currentSelected = useThreadStore.getState().selectedWorkspaceId;
      if (currentSelected) void window.traceAPI.releasePorts(currentSelected);
      useAppUIStore.getState().setActiveAiChatId(null);
      switchChannel(channelId);
      useWorkspaceStore.getState().clearWorkspaces();
      useKanbanStore.getState().clearBoard();
      useAppUIStore.getState().setMiddlePanelView('chat');
      useThreadStore.getState().closeThreadPanel();
      useAppUIStore.getState().setChannelWidth(220);
      useTerminalStore.getState().detachAll();
    },
    [switchChannel],
  );

  const handleSwitchServer = useCallback(
    (serverId: string) => {
      if (serverId === activeServerId) {
        useAppUIStore.getState().setChannelWidth(useAppUIStore.getState().channelWidth > 0 ? 0 : 220);
        return;
      }
      switchServer(serverId);
      useAppUIStore.getState().setChannelWidth(220);
      const firstChannel = enrichedChannels.find((ch) => ch.serverId === serverId);
      if (firstChannel) handleSwitchChannel(firstChannel.id);
    },
    [switchServer, enrichedChannels, handleSwitchChannel, activeServerId],
  );

  const handleSwitchAiChat = useCallback(
    (chatId: string) => {
      useAppUIStore.getState().setActiveAiChatId(chatId);
      useThreadStore.getState().closeThreadPanel();
      useAppUIStore.getState().setChannelWidth(220);
    },
    [],
  );

  const handleCreateAiChat = useCallback(async () => {
    if (!activeServerId) return;
    try {
      const chat = await createAiChat(activeServerId);
      if (chat) {
        useAppUIStore.getState().setActiveAiChatId(chat.id);
        useThreadStore.getState().closeThreadPanel();
        useAppUIStore.getState().setChannelWidth(220);
      }
    } catch (err) {
      console.error('[App] handleCreateAiChat failed:', err);
    }
  }, [activeServerId, createAiChat]);

  const handleDeleteAiChat = useCallback(
    async (id: string) => {
      await deleteAiChatMutation(id);
      if (useAppUIStore.getState().activeAiChatId === id) {
        useAppUIStore.getState().setActiveAiChatId(null);
      }
    },
    [deleteAiChatMutation],
  );

  const handleCloseThread = useCallback(() => {
    if (useAppUIStore.getState().isFullscreen) {
      useAppUIStore.getState().setIsFullscreen(false);
      useAppUIStore.getState().setChannelWidth(savedWidthsRef.current.channel);
      return;
    }
    useThreadStore.getState().closeThreadPanel();
  }, []);

  const enterFullscreen = useCallback(async () => {
    const currentRepoPath = getChannelRepoPath();
    const wsId = useThreadStore.getState().selectedWorkspaceId;
    if (!wsId || !currentRepoPath) return;
    const result = await window.traceAPI.checkWorktreeExists(wsId, currentRepoPath);
    if (!result.success || !result.exists || !result.worktreePath) return;

    const ui = useAppUIStore.getState();
    savedWidthsRef.current = { channel: ui.channelWidth, thread: useThreadStore.getState().threadWidth };
    useAppUIStore.getState().setChannelWidth(0);
    useAppUIStore.getState().setIsFullscreen(true);
  }, [getChannelRepoPath]);

  const exitFullscreen = useCallback(() => {
    useAppUIStore.getState().setIsFullscreen(false);
    useAppUIStore.getState().setChannelWidth(savedWidthsRef.current.channel);
    useThreadStore.getState().setThreadWidth(savedWidthsRef.current.thread);
  }, []);

  useEffect(() => {
    if (isFullscreen && hasWorktree === false) exitFullscreen();
  }, [exitFullscreen, hasWorktree, isFullscreen]);

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

  // Fallback polling when subscriptions are down
  useEffect(() => {
    const interval = setInterval(() => {
      if (!activeChannelId || subscriptionsActive) return;
      void refreshWorkspaces(activeChannelId);
      const selectedWs = useThreadStore.getState().selectedWorkspace;
      if (selectedWs) void loadSessionEvents(selectedWs);
    }, 3000);
    return () => clearInterval(interval);
  }, [activeChannelId, loadSessionEvents, refreshWorkspaces, subscriptionsActive]);

  // Sync terminal selection with workspace selection
  useEffect(() => {
    useTerminalStore.getState().selectWorkspace(selectedWorkspaceId);
  }, [selectedWorkspaceId]);

  // Keyboard shortcut: Cmd+T for new terminal
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 't' && (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        useTerminalStore.getState().addTerminal();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ─── Terminal initialization ─────────────────────────────────────
  const handleInitializeTerminals = useCallback(async () => {
    const wsId = useThreadStore.getState().selectedWorkspaceId;
    if (!wsId || !activeChannelId || !repoPath) return;
    if (useTerminalStore.getState().isInitialized(wsId)) return;
    const worktreeResult = await window.traceAPI.checkWorktreeExists(wsId, repoPath);
    if (!worktreeResult.success || !worktreeResult.exists || !worktreeResult.worktreePath) return;

    const env: Record<string, string> = { REPO_FOLDER: worktreeResult.worktreePath };
    const portResult = await window.traceAPI.allocatePorts(wsId, 10);
    if (portResult.success && portResult.ports) {
      const ports = portResult.ports;
      env.PORT = String(ports[0]);
      env.TRACE_BASE_PORT = String(ports[0]);
      for (let i = 0; i < ports.length; i += 1) env[`TRACE_PORT_${i}`] = String(ports[i]);
    }

    useTerminalStore.getState().initializeDefaults(wsId, worktreeResult.worktreePath, env);
  }, [activeChannelId, repoPath]);

  const handleRerunScript = useCallback(async (tabName: string) => {
    const wsId = useThreadStore.getState().selectedWorkspaceId;
    if (!wsId || !activeChannelId || !repoPath) return;
    const worktreeResult = await window.traceAPI.checkWorktreeExists(wsId, repoPath);
    if (!worktreeResult.success || !worktreeResult.exists || !worktreeResult.worktreePath) return;

    const channel = enrichedChannels.find((item) => item.id === activeChannelId);
    const script = tabName === 'Setup' ? channel?.setupScript : channel?.runScript;
    if (!script?.trim()) return;

    const env: Record<string, string> = { REPO_FOLDER: worktreeResult.worktreePath };
    if (tabName === 'Run') {
      await window.traceAPI.releasePorts(wsId);
      const portResult = await window.traceAPI.allocatePorts(wsId, 10);
      if (portResult.success && portResult.ports) {
        const ports = portResult.ports;
        env.PORT = String(ports[0]);
        env.TRACE_BASE_PORT = String(ports[0]);
        for (let i = 0; i < ports.length; i += 1) env[`TRACE_PORT_${i}`] = String(ports[i]);
      }
    }

    useTerminalStore.getState().rerunTab(tabName, script, env);
  }, [activeChannelId, enrichedChannels, repoPath]);

  const handleStopScript = useCallback((tabName: string) => {
    useTerminalStore.getState().stopTab(tabName);
    if (tabName === 'Run') {
      const wsId = useThreadStore.getState().selectedWorkspaceId;
      if (wsId) void window.traceAPI.releasePorts(wsId);
    }
  }, []);

  useEffect(() => {
    if (hasWorktree === true && selectedWorkspaceId) void handleInitializeTerminals();
  }, [hasWorktree, selectedWorkspaceId, handleInitializeTerminals]);

  const handleDeleteWorktree = useCallback(() => {
    const wsId = useThreadStore.getState().selectedWorkspaceId;
    if (wsId) {
      useTerminalStore.getState().killAllForWorkspace(wsId);
      void window.traceAPI.releasePorts(wsId);
    }
    void deleteWorktree((workspaceId) => void updateWorkspaceStatus(workspaceId, 'completed'));
  }, [deleteWorktree, updateWorkspaceStatus]);

  const handleDeleteWorktreeById = useCallback(
    async (workspaceId: string) => {
      const repoPath = getChannelRepoPath();
      if (!repoPath) return;

      const confirmed = window.confirm('Delete this worktree? This removes local files for this workspace.');
      if (!confirmed) return;

      useTerminalStore.getState().killAllForWorkspace(workspaceId);
      void window.traceAPI.releasePorts(workspaceId);
      useWorkspaceStore.getState().addDeletingWorktreeId(workspaceId);

      try {
        const result = await window.traceAPI.deleteWorktree(workspaceId, repoPath);
        if (!result.success) {
          console.error('Failed to delete worktree:', result.error);
          return;
        }
        useWorkspaceStore.getState().removeWorktreeWorkspaceId(workspaceId);
        if (workspaceId === useThreadStore.getState().selectedWorkspaceId) {
          useThreadStore.getState().setHasWorktree(false);
        }
      } catch (err) {
        console.error('Failed to delete worktree:', err);
      } finally {
        useWorkspaceStore.getState().removeDeletingWorktreeId(workspaceId);
      }
    },
    [getChannelRepoPath],
  );

  // ─── Settings / channel modals ───────────────────────────────────
  const settingsChannel = useMemo(
    () => enrichedChannels.find((channel) => channel.id === settingsChannelId) ?? null,
    [enrichedChannels, settingsChannelId],
  );

  const handleOpenSettings = useCallback((channelId: string) => {
    useAppUIStore.getState().setSettingsChannelId(channelId);
  }, []);

  const handleSaveSettings = useCallback(
    async (
      channelData: { name?: string; workspacesEnabled?: boolean; teamIds?: string[]; defaultSetupScript?: string | null; defaultRunScript?: string | null },
      localCfg: LocalChannelConfig | null,
    ) => {
      if (!settingsChannelId) return;
      await updateChannelSettings(settingsChannelId, channelData);
      if (localCfg) await setLocalConfig(settingsChannelId, localCfg);
      void refreshChannels();
    },
    [refreshChannels, settingsChannelId, updateChannelSettings, setLocalConfig],
  );

  const handleDeleteChannel = useCallback(
    async (channelId: string) => {
      const success = await deleteChannel(channelId);
      if (!success) return;
      useAppUIStore.getState().setSettingsChannelId(null);
      if (activeChannelId === channelId) {
        const remaining = serverChannels.filter((ch) => ch.id !== channelId);
        if (remaining.length > 0) switchChannel(remaining[0].id);
      }
      void refreshChannels();
    },
    [deleteChannel, activeChannelId, serverChannels, switchChannel, refreshChannels],
  );

  // ─── Computed values ─────────────────────────────────────────────
  const scriptsAvailable = Boolean(activeChannelId && hasWorktree === true);
  const hasSetupScript = Boolean(enrichedActiveChannel?.setupScript?.trim());
  const hasRunScript = Boolean(enrichedActiveChannel?.runScript?.trim());
  const displayChannel = enrichedActiveChannel ?? serverChannels[0] ?? null;
  const panelTitle = displayChannel ? `# ${displayChannel.name}` : '';
  const activeChannelRepoPath = enrichedActiveChannel?.localRepoPath ?? '';
  const activeChannelBaseBranch = enrichedActiveChannel?.baseBranch ?? 'main';

  const teamProjects = useMemo(
    () =>
      displayChannel?.type === 'team'
        ? serverChannels.filter((ch) => ch.type === 'project' && ch.teamIds.includes(displayChannel.id))
        : [],
    [displayChannel, serverChannels],
  );

  // ─── Context values (assembled from stores) ──────────────────────
  const claudeActionsContextValue = useMemo(
    () => ({
      repoPath,
      pendingRunWorkspaceId,
      pendingRunInitialPrompt,
      selectedModel,
      selectedEffort,
      setSelectedModel: useClaudeRunStore.getState().setSelectedModel,
      setSelectedEffort: useClaudeRunStore.getState().setSelectedEffort,
      sendMessage: claudeActions.sendMessage,
      runPendingWorkspace: claudeActions.runPendingWorkspace,
      autoRunQueuedTicket: claudeActions.autoRunQueuedTicket,
      stopClaude: claudeActions.stopClaude,
      sendThreadMessage: claudeActions.sendThreadMessage,
      sendPlanResponse: claudeActions.sendPlanResponse,
      mergeToMain: claudeActions.mergeToMain,
      markMerged: claudeActions.markMerged,
      clearPendingRun: useClaudeRunStore.getState().clearPendingRun,
    }),
    [repoPath, pendingRunWorkspaceId, pendingRunInitialPrompt, selectedModel, selectedEffort, claudeActions],
  );

  const threadEventsContextValue = useMemo(
    () => ({
      sessionEvents,
      sessionNodes,
      sessionStatus,
      hasMoreEvents,
      loadingOlderEvents,
      threadContentRef,
      showJumpToLatest,
      scrollToLatest: () => scrollThreadToBottom('smooth'),
      onThreadScroll,
    }),
    [sessionEvents, sessionNodes, sessionStatus, hasMoreEvents, loadingOlderEvents, threadContentRef, showJumpToLatest, scrollThreadToBottom, onThreadScroll],
  );

  const threadContextValue = useMemo(
    () => ({
      selectedWorkspaceId,
      activeSessionId,
      sessions,
      threadWidth: isFullscreen ? 9999 : threadWidth,
      deletingWorktree,
      hasWorktree,
      expandedReadGroupIds,
      expandedTurnGroupIds,
      openThreadPanel,
      closeThreadPanel,
      toggleReadGroup,
      toggleTurnGroup,
      setHasWorktree: useThreadStore.getState().setHasWorktree,
      setThreadWidth,
      loadSessionEvents,
      deleteWorktree,
      switchSession,
      clearSession,
      channelTickets,
      setTicketDependencies: handleSetTicketDependencies,
      removeTicketDependency: handleRemoveTicketDependency,
      updateQueuedRunConfig: handleUpdateQueuedRunConfig,
      isClaudeRunning,
      workspaceStatus: selectedWorkspaceStatus,
      workspaceUserId: selectedWorkspaceUserId,
      queuedRunConfig: selectedWorkspaceQueuedRunConfig,
      selectedTicket,
      isFullscreen,
      scriptsAvailable,
      hasSetupScript,
      hasRunScript,
      dragging,
      onClose: handleCloseThread,
      onDeleteWorktree: handleDeleteWorktree,
      onInitializeTerminals: (): void => { void handleInitializeTerminals(); },
      onRerunScript: (tabName: string): void => { void handleRerunScript(tabName); },
      onStopScript: (tabName: string): void => { handleStopScript(tabName); },
      runScriptRunning: terminalList.some((t) => t.name === 'Run' && runningPtyIds.has(t.terminalId)),
      onStartDrag: () => startDragging('right'),
      onEnterFullscreen: (): void => { void enterFullscreen(); },
      onExitFullscreen: exitFullscreen,
      baseBranch: activeChannelBaseBranch,
      terminals: terminalList,
      allTerminalEntries,
      terminalsInitialized,
      activeTerminalTabId: activeTabId,
      terminalCwd: terminalsCwd || activeChannelRepoPath,
      onSelectTerminalTab: setActiveTabId,
      onCloseTerminalTab: killTerminal,
      onCloseAllTerminals: (): void => {
        const wsId = useThreadStore.getState().selectedWorkspaceId;
        if (wsId) useTerminalStore.getState().killAllForWorkspace(wsId);
      },
      onAddTerminal: addTerminal,
      onOpenSettings: (): void => { if (activeChannelId) handleOpenSettings(activeChannelId); },
    }),
    [
      selectedWorkspaceId, activeSessionId, sessions, threadWidth,
      deletingWorktree, hasWorktree, expandedReadGroupIds, expandedTurnGroupIds, openThreadPanel,
      closeThreadPanel, toggleReadGroup, toggleTurnGroup, setThreadWidth,
      loadSessionEvents, deleteWorktree, switchSession, clearSession,
      channelTickets, handleSetTicketDependencies, handleRemoveTicketDependency, handleUpdateQueuedRunConfig,
      isClaudeRunning, selectedWorkspaceStatus, selectedWorkspaceUserId, selectedWorkspaceQueuedRunConfig, selectedTicket,
      isFullscreen, scriptsAvailable, hasSetupScript, hasRunScript, dragging,
      handleCloseThread, handleDeleteWorktree, handleInitializeTerminals, handleRerunScript, handleStopScript,
      startDragging, enterFullscreen, exitFullscreen,
      activeChannelBaseBranch, terminalList, allTerminalEntries, terminalsInitialized, activeTabId,
      terminalsCwd, activeChannelRepoPath, setActiveTabId,
      killTerminal, addTerminal, handleOpenSettings, activeChannelId,
      runningPtyIds,
    ],
  );

  // ─── Render ──────────────────────────────────────────────────────
  return (
    <ClaudeActionsProvider value={claudeActionsContextValue}>
      <ThreadProvider value={threadContextValue} eventsValue={threadEventsContextValue}>
        <div className="flex h-screen flex-col overflow-hidden bg-[#1a1b26] text-[#c0caf5]">
          <div className="flex min-h-0 flex-1 overflow-hidden">
            {!isFullscreen && (
              <ServerRail
                servers={servers}
                activeServerId={activeServerId}
                onSwitchServer={handleSwitchServer}
                onCreateServer={() => useAppUIStore.getState().setShowCreateServer(true)}
              />
            )}

            <ChannelPanel
              channels={serverChannels}
              activeChannelId={activeChannelId}
              channelWidth={isFullscreen ? 0 : channelWidth}
              dragging={dragging}
              serverName={activeServer?.name}
              aiChats={aiChats}
              activeAiChatId={activeAiChatId}
              unreadCounts={unreadCounts}
              onSwitchChannel={handleSwitchChannel}
              onCreateTeam={() => useAppUIStore.getState().setCreateChannelType('team')}
              onCreateProject={() => useAppUIStore.getState().setCreateChannelType('project')}
              onCreateChannel={() => useAppUIStore.getState().setCreateChannelType('channel')}
              onSwitchAiChat={handleSwitchAiChat}
              onCreateAiChat={() => { void handleCreateAiChat(); }}
              onDeleteAiChat={(id) => { void handleDeleteAiChat(id); }}
              onStartDrag={() => startDragging('left')}
            />

            <div
              className="flex min-h-0 min-w-0 flex-col panel-animate"
              style={{ flex: '1 1 0%', overflow: 'hidden' }}
            >
              {!isFullscreen && !activeAiChatId && (
                <ChannelTopBar
                  panelTitle={panelTitle}
                  channelType={(displayChannel?.type ?? 'project') as ChannelType}
                  workspacesEnabled={displayChannel?.workspacesEnabled ?? true}
                  middlePanelView={middlePanelView}
                  onSetView={handleSetView}
                  onOpenSettings={() => { if (displayChannel) handleOpenSettings(displayChannel.id); }}
                />
              )}
              <div className="flex min-h-0 flex-1 flex-col">
                {activeAiChatId ? (
                  <AiChatPanel
                    chatId={activeAiChatId}
                    chatTitle={aiChats.find((c) => c.id === activeAiChatId)?.title ?? 'AI Chat'}
                  />
                ) : (
                  <MessagePanel
                    panelTitle={panelTitle}
                    channelId={activeChannelId}
                    channelCreatedAt={enrichedActiveChannel?.createdAt ?? null}
                    workspaces={workspaces}
                    selectedWorkspaceId={selectedWorkspaceId}
                    attentionWorkspaceIds={attentionWorkspaceIds}
                    onOpenWorkspace={handleOpenWorkspace}
                    onDeleteWorkspace={handleDeleteWorkspace}
                    onDeleteWorktree={handleDeleteWorktreeById}
                    worktreeWorkspaceIds={worktreeWorkspaceIds}
                    deletingWorktreeIds={deletingWorktreeIds}
                    middlePanelView={middlePanelView}
                    kanbanColumns={kanbanColumns}
                    kanbanLoading={kanbanLoading}
                    onMoveTicket={handleMoveTicket}
                    isFullscreen={isFullscreen}
                    teamProjects={teamProjects}
                    onSwitchChannel={handleSwitchChannel}
                    workspacesWithRunningProcesses={workspacesWithRunningProcesses}
                    activeRunWorkspaceIds={activeRunWorkspaceIds}
                  />
                )}
              </div>
            </div>
          </div>

          {settingsChannel && (
            <ChannelSettingsModal
              channel={settingsChannel}
              teams={serverChannels.filter((ch) => ch.type === 'team')}
              localConfig={getLocalConfig(settingsChannel.id)}
              onClose={() => useAppUIStore.getState().setSettingsChannelId(null)}
              onSave={handleSaveSettings}
              onDelete={handleDeleteChannel}
            />
          )}

          {createChannelType && (
            <CreateChannelModal
              serverId={activeServerId}
              channelType={createChannelType}
              teams={serverChannels.filter((ch) => ch.type === 'team')}
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
                if (server.channels.length > 0) handleSwitchChannel(server.channels[0].id);
              }}
            />
          )}
        </div>
      </ThreadProvider>
    </ClaudeActionsProvider>
  );
}
