import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Workspace, Channel, ChannelType, LocalChannelConfig, MiddlePanelView, TicketStatus } from './types';
import { gql } from '@apollo/client';
import { WORKSPACE_FIELDS } from './graphql/fragments';
import { useUpdateWorkspaceStatusMutation, useDeleteWorkspaceMutation, useSetTicketDependenciesMutation, useRemoveTicketDependencyMutation, useUpdateQueuedRunConfigMutation } from './__generated__/App.generated';
import { buildSessionNodes } from './utils';
import { useWorkspaces } from './hooks/useMessages';
import { useThread } from './hooks/useThread';
import { useThreadScroll } from './hooks/useThreadScroll';
import { usePanelResize } from './hooks/usePanelResize';
import { useChannelSubscriptions } from './hooks/useChannelSubscriptions';
import { useStartupTerminals } from './hooks/useStartupTerminals';
import { useClaudeWorkspaceActions } from './hooks/useClaudeMessageActions';
import { usePRPolling } from './hooks/usePRPolling';
import { useKanban } from './hooks/useKanban';
import { useAiChats } from './hooks/useAiChats';
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

  const {
    workspaces,
    workspacesRef,
    upsertWorkspace,
    removeWorkspace,
    refreshWorkspaces,
    clearWorkspaces,
  } = useWorkspaces();

  const activeChannelRef = useRef<Channel | null>(null);
  activeChannelRef.current = enrichedActiveChannel;

  const getChannelRepoPath = useCallback(() => activeChannelRef.current?.localRepoPath ?? '', []);
  const getChannelBaseBranch = useCallback(() => activeChannelRef.current?.baseBranch ?? 'main', []);

  const getActiveChannelId = useCallback(() => activeChannelId, [activeChannelId]);

  const {
    selectedWorkspaceId,
    selectedWorkspaceRef,
    selectedWorkspaceIdRef,
    sessionEvents,
    sessionEventsRef,
    threadWidth,
    setThreadWidth,
    activeSessionId,
    activeSessionIdRef,
    sessions,
    sessionStatus,
    deletingWorktree,
    hasWorktree,
    setHasWorktree,
    expandedReadGroupIds,
    expandedTurnGroupIds,
    reportClaudeActivity,
    closeThreadPanel,
    loadSessionEvents,
    loadOlderEvents,
    appendSessionEvent,
    updateSessionEvent,
    hasMoreEvents,
    loadingOlderEvents,
    openThreadPanel,
    switchSession,
    clearSession,
    deleteWorktree,
    toggleReadGroup,
    toggleTurnGroup,
    syncSelectedWorkspace,
  } = useThread({ getChannelRepoPath, getChannelBaseBranch, getActiveChannelId });

  const upsertAndSyncWorkspace = useCallback(
    (workspace: Workspace) => {
      upsertWorkspace(workspace);
      syncSelectedWorkspace(workspace);
    },
    [upsertWorkspace, syncSelectedWorkspace],
  );

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

  const {
    terminals: terminalList,
    activeTabId,
    setActiveTabId,
    cwd: terminalsCwd,
    initialized: terminalsInitialized,
    allTerminalEntries,
    selectWorkspace: selectTerminalWorkspace,
    initializeDefaults: initializeTerminalDefaults,
    rerunTab,
    stopTab,
    isInitialized: isTerminalInitialized,
    killAllForWorkspace: killTerminalsForWorkspace,
    killAll: killAllTerminals,
    killTerminal,
    addTerminal,
    runAllScripts,
  } = useStartupTerminals();

  const {
    columns: kanbanColumns,
    loading: kanbanLoading,
    fetchBoard,
    upsertTicket,
    moveTicket,
    clearBoard,
  } = useKanban();

  const {
    aiChats,
    fetchAiChats,
    createAiChat,
    deleteAiChat: deleteAiChatMutation,
    updateAiChatInList,
  } = useAiChats();

  const [activeAiChatId, setActiveAiChatId] = useState<string | null>(null);

  const [executeUpdateWorkspaceStatus] = useUpdateWorkspaceStatusMutation();
  const [executeDeleteWorkspace] = useDeleteWorkspaceMutation();
  const [executeSetTicketDependencies] = useSetTicketDependenciesMutation();
  const [executeRemoveTicketDependency] = useRemoveTicketDependencyMutation();
  const [executeUpdateQueuedRunConfig] = useUpdateQueuedRunConfigMutation();

  const [middlePanelView, setMiddlePanelView] = useState<MiddlePanelView>('chat');
  const [channelWidth, setChannelWidth] = useState(220);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [attentionWorkspaceIds, setAttentionWorkspaceIds] = useState<Set<string>>(new Set());
  const [settingsChannelId, setSettingsChannelId] = useState<string | null>(null);
  const [createChannelType, setCreateChannelType] = useState<ChannelType | null>(null);
  const [showCreateServer, setShowCreateServer] = useState(false);
  const [worktreeWorkspaceIds, setWorktreeWorkspaceIds] = useState<Set<string>>(new Set());
  const savedWidthsRef = useRef({ channel: 220, thread: 0 });
  const autoRunRef = useRef<((workspaceId: string, runConfig: unknown) => void) | null>(null);

  const { dragging, startDragging } = usePanelResize(setChannelWidth, setThreadWidth, SERVER_RAIL_WIDTH);

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  }, []);

  // Check worktree existence for merged workspaces
  useEffect(() => {
    const repoPath = getChannelRepoPath();
    if (!repoPath || !window.traceAPI?.checkWorktreeExists) return;

    const mergedWorkspaces = workspaces.filter((ws) => ws.status === 'merged');
    if (mergedWorkspaces.length === 0) {
      setWorktreeWorkspaceIds((prev) => prev.size === 0 ? prev : new Set());
      return;
    }

    let cancelled = false;
    void (async () => {
      const ids = new Set<string>();
      for (const ws of mergedWorkspaces) {
        try {
          const result = await window.traceAPI.checkWorktreeExists(ws.id, repoPath);
          if (result.success && result.exists) {
            ids.add(ws.id);
          }
        } catch {
          // ignore
        }
      }
      if (!cancelled) {
        setWorktreeWorkspaceIds(ids);
      }
    })();

    return () => { cancelled = true; };
  }, [workspaces, getChannelRepoPath]);

  const handleNeedsAttention = useCallback(
    (workspaceId: string, reason: 'stopped' | 'ask-user-question' | 'completed' | 'merged' | 'needs_input') => {
      setAttentionWorkspaceIds((current) => {
        if (current.has(workspaceId)) return current;
        const next = new Set(current);
        next.add(workspaceId);
        return next;
      });

      if (!document.hasFocus() && 'Notification' in window && Notification.permission === 'granted') {
        const NOTIFICATION_TITLES: Record<string, string> = {
          'ask-user-question': 'Input needed',
          'needs_input': 'Input needed',
          'merged': 'Branch merged',
        };
        const title = NOTIFICATION_TITLES[reason] ?? 'Chat completed';
        const workspace = workspacesRef.current.find((item) => item.id === workspaceId);
        const body = workspace?.preview || workspace?.cliSession.cwd || workspaceId;
        const notification = new Notification(title, { body });
        notification.onclick = () => {
          void window.traceAPI.focusWindow();
        };
      }
    },
    [workspacesRef],
  );

  const updateWorkspaceStatus = useCallback(
    async (workspaceId: string, status: TicketStatus) => {
      if (!activeChannelId) return;
      try {
        const { data } = await executeUpdateWorkspaceStatus({
          variables: {
            channelId: activeChannelId,
            workspaceId,
            status,
          },
        });

        if (!data) return;
        upsertAndSyncWorkspace(data.updateWorkspaceStatus as Workspace);
      } catch {
        console.error('Failed to update workspace status');
      }
    },
    [activeChannelId, executeUpdateWorkspaceStatus, upsertAndSyncWorkspace],
  );

  const { triggerCheck: triggerPRCheck } = usePRPolling({
    workspacesRef,
    getChannelId: getActiveChannelId,
    updateWorkspaceStatus,
  });

  const { subscriptionsActive } = useChannelSubscriptions({
    activeChannelId,
    upsertWorkspace: upsertAndSyncWorkspace,
    removeWorkspace,
    appendSessionEvent,
    updateSessionEvent,
    reportClaudeActivity,
    selectedWorkspaceIdRef,
    activeSessionIdRef,
    workspacesRef,
    onNeedsAttention: handleNeedsAttention,
    upsertTicket,
    onTicketReadyToRun: useCallback((workspaceId: string, runConfig: unknown) => {
      autoRunRef.current?.(workspaceId, runConfig);
    }, []),
    onWorkspaceCompleted: triggerPRCheck,
    refreshWorkspaces,
  });

  const handleSetView = useCallback(
    (view: MiddlePanelView) => {
      setMiddlePanelView(view);
      if (view === 'board' && activeChannelId) {
        void fetchBoard(activeChannelId);
      }
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

      if (selectedWorkspaceId === workspaceId) {
        closeThreadPanel();
      }

      try {
        await executeDeleteWorkspace({
          variables: { channelId: activeChannelId, workspaceId },
        });
        removeWorkspace(workspaceId);
        killTerminalsForWorkspace(workspaceId);
        void window.traceAPI.releasePorts(workspaceId);
        void window.traceAPI.deleteWorktree(workspaceId, getChannelRepoPath());
      } catch {
        console.error('Failed to delete workspace');
      }
    },
    [activeChannelId, selectedWorkspaceId, closeThreadPanel, executeDeleteWorkspace, removeWorkspace, getChannelRepoPath],
  );

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
    () =>
      kanbanColumns.flatMap((col) =>
        col.tickets.map((t) => ({
          workspaceId: t.workspaceId,
          title: t.title,
          status: t.workspace?.status ?? 'pending',
        })),
      ),
    [kanbanColumns],
  );

  const handleSetTicketDependencies = useCallback(
    async (workspaceId: string, depIds: string[], runConfig: { prompt: string; model: string; effort: string; planMode: boolean }) => {
      if (!activeChannelId) return;
      try {
        const { data } = await executeSetTicketDependencies({
          variables: {
            channelId: activeChannelId,
            workspaceId,
            dependsOnWorkspaceIds: depIds,
            runConfig,
          },
        });
        if (data?.setTicketDependencies) {
          upsertAndSyncWorkspace(data.setTicketDependencies as Workspace);
        }
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
        await executeRemoveTicketDependency({
          variables: { channelId: activeChannelId, workspaceId, dependsOnWorkspaceId },
        });
      } catch {
        console.error('Failed to remove ticket dependency');
      }
    },
    [activeChannelId, executeRemoveTicketDependency],
  );

  const handleUpdateQueuedRunConfig = useCallback(
    async (workspaceId: string, runConfig: { prompt: string; model: string; effort: string; planMode: boolean }) => {
      try {
        await executeUpdateQueuedRunConfig({
          variables: { workspaceId, runConfig },
        });
      } catch {
        console.error('Failed to update queued run config');
      }
    },
    [executeUpdateQueuedRunConfig],
  );

  const handleOpenWorkspace = useCallback(
    (workspace: Workspace) => {
      resetScroll();
      openThreadPanel(workspace);
      setMiddlePanelView('workspaces');
      setAttentionWorkspaceIds((current) => {
        if (!current.has(workspace.id)) return current;
        const next = new Set(current);
        next.delete(workspace.id);
        return next;
      });
    },
    [openThreadPanel, resetScroll],
  );

  const getSetupCommands = useCallback((): string[] => {
    if (!enrichedActiveChannel?.setupScript) return [];
    return enrichedActiveChannel.setupScript
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  }, [enrichedActiveChannel]);

  const activeSystemInstructions = activeChannelId ? localConfigs[activeChannelId]?.systemInstructions : undefined;
  const getSystemInstructions = useCallback((): string | undefined => activeSystemInstructions, [activeSystemInstructions]);

  const claudeActions = useClaudeWorkspaceActions({
    activeChannelId,
    selectedWorkspaceId,
    selectedWorkspaceRef,
    selectedWorkspaceIdRef,
    activeSessionIdRef,
    sessionEventsRef,
    clearSession,
    onWorkspaceCreated: handleOpenWorkspace,
    loadSessionEvents,
    upsertWorkspace: upsertAndSyncWorkspace,
    setHasWorktree,
    updateWorkspaceStatus,
    getSetupCommands,
    getChannelRepoPath,
    getChannelBaseBranch,
    getSystemInstructions,
  });

  // Populate autoRunRef so the subscription callback can call autoRunQueuedTicket
  useEffect(() => {
    autoRunRef.current = (workspaceId: string, runConfig: unknown) => {
      const config = runConfig as { prompt: string; model: string; effort: string; planMode: boolean };
      void claudeActions.autoRunQueuedTicket(workspaceId, config);
    };
  }, [claudeActions.autoRunQueuedTicket]);

  const repoPath = enrichedActiveChannel?.localRepoPath ?? '';
  const claudeActionsContextValue = useMemo(
    () => ({
      repoPath,
      pendingRunWorkspaceId: claudeActions.pendingRunWorkspaceId,
      pendingRunInitialPrompt: claudeActions.pendingRunInitialPrompt,
      selectedModel: claudeActions.selectedModel,
      selectedEffort: claudeActions.selectedEffort,
      setSelectedModel: claudeActions.setSelectedModel,
      setSelectedEffort: claudeActions.setSelectedEffort,
      sendMessage: claudeActions.sendMessage,
      runPendingWorkspace: claudeActions.runPendingWorkspace,
      autoRunQueuedTicket: claudeActions.autoRunQueuedTicket,
      stopClaude: claudeActions.stopClaude,
      sendThreadMessage: claudeActions.sendThreadMessage,
      sendPlanResponse: claudeActions.sendPlanResponse,
      mergeToMain: claudeActions.mergeToMain,
      markMerged: claudeActions.markMerged,
      clearPendingRun: claudeActions.clearPendingRun,
    }),
    [
      repoPath,
      claudeActions.pendingRunWorkspaceId,
      claudeActions.pendingRunInitialPrompt,
      claudeActions.selectedModel,
      claudeActions.selectedEffort,
      claudeActions.setSelectedModel,
      claudeActions.setSelectedEffort,
      claudeActions.sendMessage,
      claudeActions.runPendingWorkspace,
      claudeActions.autoRunQueuedTicket,
      claudeActions.stopClaude,
      claudeActions.sendThreadMessage,
      claudeActions.sendPlanResponse,
      claudeActions.mergeToMain,
      claudeActions.markMerged,
      claudeActions.clearPendingRun,
    ],
  );

  const isWorkspaceSpawned = claudeActions.isWorkspaceSpawned;
  const isClaudeRunning = useMemo(() => {
    if (!selectedWorkspaceId || !isWorkspaceSpawned(selectedWorkspaceId)) return false;
    // After /clear, the session is empty – Claude isn't running on it
    if (sessionStatus === 'empty') return false;
    const lastEvent = sessionEvents[sessionEvents.length - 1];
    if (lastEvent?.hookEventName === 'Stop') return false;
    const workspace = workspaces.find((item) => item.id === selectedWorkspaceId);
    return workspace ? workspace.cliSession.status !== 'stopped' : false;
  }, [isWorkspaceSpawned, workspaces, selectedWorkspaceId, sessionEvents, sessionStatus]);

  useEffect(() => {
    if (activeChannelId) {
      void refreshWorkspaces(activeChannelId);
      void fetchBoard(activeChannelId);
    }
  }, [activeChannelId, refreshWorkspaces, fetchBoard]);

  // Fetch AI chats when server changes
  useEffect(() => {
    if (activeServerId) {
      void fetchAiChats(activeServerId);
    }
  }, [activeServerId, fetchAiChats]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!activeChannelId || subscriptionsActive) return;
      void refreshWorkspaces(activeChannelId);
      if (selectedWorkspaceRef.current) {
        void loadSessionEvents(selectedWorkspaceRef.current);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [activeChannelId, loadSessionEvents, refreshWorkspaces, selectedWorkspaceRef, subscriptionsActive]);

  // Sync terminal selection with workspace selection
  useEffect(() => {
    selectTerminalWorkspace(selectedWorkspaceId);
  }, [selectedWorkspaceId, selectTerminalWorkspace]);

  const handleSwitchChannel = useCallback(
    (channelId: string) => {
      if (selectedWorkspaceId) {
        void window.traceAPI.releasePorts(selectedWorkspaceId);
      }
      setActiveAiChatId(null);
      switchChannel(channelId);
      clearWorkspaces();
      clearBoard();
      setMiddlePanelView('chat');
      closeThreadPanel();
      setChannelWidth(220);
      killAllTerminals();
    },
    [switchChannel, clearWorkspaces, clearBoard, closeThreadPanel, killAllTerminals, selectedWorkspaceId],
  );


  const handleSwitchServer = useCallback(
    (serverId: string) => {
      if (serverId === activeServerId) {
        setChannelWidth((w) => (w > 0 ? 0 : 220));
        return;
      }
      switchServer(serverId);
      setChannelWidth(220);
      const firstChannel = enrichedChannels.find((ch) => ch.serverId === serverId);
      if (firstChannel) {
        handleSwitchChannel(firstChannel.id);
      }
    },
    [switchServer, enrichedChannels, handleSwitchChannel, activeServerId],
  );

  const handleSwitchAiChat = useCallback(
    (chatId: string) => {
      setActiveAiChatId(chatId);
      closeThreadPanel();
      setChannelWidth(220);
    },
    [closeThreadPanel],
  );

  const handleCreateAiChat = useCallback(async () => {
    if (!activeServerId) {
      console.warn('[App] handleCreateAiChat: no activeServerId');
      return;
    }
    try {
      const chat = await createAiChat(activeServerId);
      if (chat) {
        setActiveAiChatId(chat.id);
        closeThreadPanel();
        setChannelWidth(220);
      }
    } catch (err) {
      console.error('[App] handleCreateAiChat failed:', err);
    }
  }, [activeServerId, createAiChat, closeThreadPanel]);

  const handleDeleteAiChat = useCallback(
    async (id: string) => {
      await deleteAiChatMutation(id);
      if (activeAiChatId === id) {
        setActiveAiChatId(null);
      }
    },
    [deleteAiChatMutation, activeAiChatId],
  );

  const handleCloseThread = useCallback(() => {
    if (isFullscreen) {
      setIsFullscreen(false);
      setChannelWidth(savedWidthsRef.current.channel);
      return;
    }
    closeThreadPanel();
  }, [closeThreadPanel, isFullscreen]);

  const enterFullscreen = useCallback(async () => {
    const currentRepoPath = getChannelRepoPath();
    if (!selectedWorkspaceId || !currentRepoPath) return;
    const result = await window.traceAPI.checkWorktreeExists(selectedWorkspaceId, currentRepoPath);
    if (!result.success || !result.exists || !result.worktreePath) return;

    savedWidthsRef.current = { channel: channelWidth, thread: threadWidth };
    setChannelWidth(0);
    setIsFullscreen(true);
  }, [channelWidth, getChannelRepoPath, selectedWorkspaceId, threadWidth]);

  const exitFullscreen = useCallback(() => {
    setIsFullscreen(false);
    setChannelWidth(savedWidthsRef.current.channel);
    setThreadWidth(savedWidthsRef.current.thread);
  }, [setThreadWidth]);

  useEffect(() => {
    if (isFullscreen && hasWorktree === false) {
      exitFullscreen();
    }
  }, [exitFullscreen, hasWorktree, isFullscreen]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 't' && (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        addTerminal();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [addTerminal]);

  const settingsChannel = useMemo(
    () => enrichedChannels.find((channel) => channel.id === settingsChannelId) ?? null,
    [enrichedChannels, settingsChannelId],
  );

  const handleOpenSettings = useCallback((channelId: string) => {
    setSettingsChannelId(channelId);
  }, []);

  const handleSaveSettings = useCallback(
    async (
      channelData: {
        name?: string;
        workspacesEnabled?: boolean;
        teamIds?: string[];
        defaultSetupScript?: string | null;
        defaultRunScript?: string | null;
      },
      localCfg: LocalChannelConfig | null,
    ) => {
      if (!settingsChannelId) return;
      await updateChannelSettings(settingsChannelId, channelData);
      if (localCfg) {
        await setLocalConfig(settingsChannelId, localCfg);
      }
      void refreshChannels();
    },
    [refreshChannels, settingsChannelId, updateChannelSettings, setLocalConfig],
  );

  const handleDeleteChannel = useCallback(
    async (channelId: string) => {
      const success = await deleteChannel(channelId);
      if (!success) return;
      setSettingsChannelId(null);
      // Switch to another channel if we deleted the active one
      if (activeChannelId === channelId) {
        const remaining = serverChannels.filter((ch) => ch.id !== channelId);
        if (remaining.length > 0) {
          switchChannel(remaining[0].id);
        }
      }
      void refreshChannels();
    },
    [deleteChannel, activeChannelId, serverChannels, switchChannel, refreshChannels],
  );

  const handleRunChannelScript = useCallback(
    (channelId: string) => {
      const channel = enrichedChannels.find((item) => item.id === channelId);
      if (!channel?.localRepoPath) return;
      const script = channel.runScript;
      if (!script?.trim()) return;
      runAllScripts(channelId, channel.localRepoPath, [{ name: 'Run', command: script }]);
    },
    [enrichedChannels, runAllScripts],
  );

  const handleInitializeTerminals = useCallback(async () => {
    if (!selectedWorkspaceId || !activeChannelId || !repoPath) return;
    // Already initialized — don't re-allocate ports or re-create tabs
    if (isTerminalInitialized(selectedWorkspaceId)) return;
    const worktreeResult = await window.traceAPI.checkWorktreeExists(selectedWorkspaceId, repoPath);
    if (!worktreeResult.success || !worktreeResult.exists || !worktreeResult.worktreePath) return;

    const portResult = await window.traceAPI.allocatePorts(selectedWorkspaceId, 10);
    let env: Record<string, string> | undefined;
    if (portResult.success && portResult.ports) {
      const ports = portResult.ports;
      env = {
        PORT: String(ports[0]),
        TRACE_BASE_PORT: String(ports[0]),
        REPO_FOLDER: worktreeResult.worktreePath,
      };
      for (let i = 0; i < ports.length; i += 1) {
        env[`TRACE_PORT_${i}`] = String(ports[i]);
      }
    }

    initializeTerminalDefaults(selectedWorkspaceId, worktreeResult.worktreePath, env);
  }, [activeChannelId, repoPath, initializeTerminalDefaults, isTerminalInitialized, selectedWorkspaceId]);

  const handleRerunScript = useCallback(async (tabName: string) => {
    if (!selectedWorkspaceId || !activeChannelId || !repoPath) return;
    const worktreeResult = await window.traceAPI.checkWorktreeExists(selectedWorkspaceId, repoPath);
    if (!worktreeResult.success || !worktreeResult.exists || !worktreeResult.worktreePath) return;

    const channel = enrichedChannels.find((item) => item.id === activeChannelId);
    const script = tabName === 'Setup' ? channel?.setupScript : channel?.runScript;
    if (!script?.trim()) return;

    let env: Record<string, string> | undefined;
    if (tabName === 'Run') {
      // Release old ports, allocate fresh ones
      await window.traceAPI.releasePorts(selectedWorkspaceId);
      const portResult = await window.traceAPI.allocatePorts(selectedWorkspaceId, 10);
      if (portResult.success && portResult.ports) {
        const ports = portResult.ports;
        env = {
          PORT: String(ports[0]),
          TRACE_BASE_PORT: String(ports[0]),
          REPO_FOLDER: worktreeResult.worktreePath,
        };
        for (let i = 0; i < ports.length; i += 1) {
          env[`TRACE_PORT_${i}`] = String(ports[i]);
        }
      }
    }

    rerunTab(tabName, script, env);
  }, [activeChannelId, enrichedChannels, repoPath, rerunTab, selectedWorkspaceId]);

  const handleStopScript = useCallback(async (tabName: string) => {
    if (tabName === 'Run' && selectedWorkspaceId) {
      await window.traceAPI.releasePorts(selectedWorkspaceId);
    }
    stopTab(tabName);
  }, [selectedWorkspaceId, stopTab]);

  // Initialize terminal tabs (and run setup script) when a worktree is detected
  useEffect(() => {
    if (hasWorktree === true && selectedWorkspaceId) {
      void handleInitializeTerminals();
    }
  }, [hasWorktree, selectedWorkspaceId, handleInitializeTerminals]);

  const handleDeleteWorktree = useCallback(() => {
    if (selectedWorkspaceId) {
      killTerminalsForWorkspace(selectedWorkspaceId);
      void window.traceAPI.releasePorts(selectedWorkspaceId);
    }
    void deleteWorktree((workspaceId) => void updateWorkspaceStatus(workspaceId, 'completed'));
  }, [killTerminalsForWorkspace, selectedWorkspaceId, deleteWorktree, updateWorkspaceStatus]);

  const handleDeleteWorktreeById = useCallback(
    async (workspaceId: string) => {
      const repoPath = getChannelRepoPath();
      if (!repoPath) return;

      const confirmed = window.confirm(
        'Delete this worktree? This removes local files for this workspace.',
      );
      if (!confirmed) return;

      killTerminalsForWorkspace(workspaceId);
      void window.traceAPI.releasePorts(workspaceId);

      try {
        const result = await window.traceAPI.deleteWorktree(workspaceId, repoPath);
        if (!result.success) {
          console.error('Failed to delete worktree:', result.error);
          return;
        }
        setWorktreeWorkspaceIds((prev) => {
          const next = new Set(prev);
          next.delete(workspaceId);
          return next;
        });
        // Update hasWorktree if this is the selected workspace
        if (workspaceId === selectedWorkspaceId) {
          setHasWorktree(false);
        }
      } catch (err) {
        console.error('Failed to delete worktree:', err);
      }
    },
    [getChannelRepoPath, killTerminalsForWorkspace, selectedWorkspaceId, setHasWorktree],
  );

  const scriptsAvailable = Boolean(activeChannelId && hasWorktree === true);
  const hasSetupScript = Boolean(enrichedActiveChannel?.setupScript?.trim());
  const hasRunScript = Boolean(enrichedActiveChannel?.runScript?.trim());
  const displayChannel = enrichedActiveChannel ?? serverChannels[0] ?? null;
  const panelTitle = displayChannel ? `# ${displayChannel.name}` : '';

  const teamProjects = useMemo(
    () =>
      displayChannel?.type === 'team'
        ? serverChannels.filter((ch) => ch.type === 'project' && ch.teamIds.includes(displayChannel.id))
        : [],
    [displayChannel, serverChannels],
  );
  const activeChannelRepoPath = enrichedActiveChannel?.localRepoPath ?? '';
  const activeChannelBaseBranch = enrichedActiveChannel?.baseBranch ?? 'main';

  // High-frequency context: changes on every SSE event
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
    [
      sessionEvents, sessionNodes, sessionStatus, hasMoreEvents, loadingOlderEvents,
      threadContentRef, showJumpToLatest, scrollThreadToBottom, onThreadScroll,
    ],
  );

  // Session-level context: changes infrequently
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
      setHasWorktree,
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
      onStopScript: (tabName: string): void => { void handleStopScript(tabName); },
      runScriptRunning: terminalList.some((t) => t.name === 'Run' && Boolean(t.command)),
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
      onCloseAllTerminals: (): void => { if (selectedWorkspaceId) killTerminalsForWorkspace(selectedWorkspaceId); },
      onAddTerminal: addTerminal,
      onOpenSettings: (): void => { if (activeChannelId) handleOpenSettings(activeChannelId); },
    }),
    [
      selectedWorkspaceId, activeSessionId, sessions, threadWidth,
      deletingWorktree, hasWorktree, expandedReadGroupIds, expandedTurnGroupIds, openThreadPanel,
      closeThreadPanel, toggleReadGroup, toggleTurnGroup, setHasWorktree, setThreadWidth,
      loadSessionEvents, deleteWorktree, switchSession, clearSession,
      channelTickets, handleSetTicketDependencies, handleRemoveTicketDependency, handleUpdateQueuedRunConfig,
      isClaudeRunning, selectedWorkspaceStatus, selectedWorkspaceUserId, selectedWorkspaceQueuedRunConfig, selectedTicket,
      isFullscreen, scriptsAvailable, hasSetupScript, hasRunScript, dragging,
      handleCloseThread, handleDeleteWorktree, handleInitializeTerminals, handleRerunScript, handleStopScript,
      startDragging, enterFullscreen, exitFullscreen,
      activeChannelBaseBranch, terminalList, allTerminalEntries, terminalsInitialized, activeTabId,
      terminalsCwd, activeChannelRepoPath, setActiveTabId,
      killTerminal, killTerminalsForWorkspace, addTerminal, handleOpenSettings, activeChannelId,
    ],
  );

  return (
    <ClaudeActionsProvider value={claudeActionsContextValue}>
      <ThreadProvider value={threadContextValue} eventsValue={threadEventsContextValue}>
        <div className="flex h-screen flex-col overflow-hidden bg-[#1a1b26] text-[#c0caf5]">
          {/* Main horizontal layout */}
          <div className="flex min-h-0 flex-1 overflow-hidden">
            {!isFullscreen && (
              <ServerRail
                servers={servers}
                activeServerId={activeServerId}
                onSwitchServer={handleSwitchServer}
                onCreateServer={() => setShowCreateServer(true)}
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
              onSwitchChannel={handleSwitchChannel}
              onOpenSettings={handleOpenSettings}
              onRunStartupScripts={handleRunChannelScript}
              onCreateTeam={() => setCreateChannelType('team')}
              onCreateProject={() => setCreateChannelType('project')}
              onCreateChannel={() => setCreateChannelType('channel')}
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
                    middlePanelView={middlePanelView}
                    kanbanColumns={kanbanColumns}
                    kanbanLoading={kanbanLoading}
                    onMoveTicket={handleMoveTicket}
                    isFullscreen={isFullscreen}
                    teamProjects={teamProjects}
                    onSwitchChannel={handleSwitchChannel}
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
              onClose={() => setSettingsChannelId(null)}
              onSave={handleSaveSettings}
              onDelete={handleDeleteChannel}
            />
          )}

          {createChannelType && (
            <CreateChannelModal
              serverId={activeServerId}
              channelType={createChannelType}
              teams={serverChannels.filter((ch) => ch.type === 'team')}
              onClose={() => setCreateChannelType(null)}
              onCreated={() => {
                setCreateChannelType(null);
                void refreshChannels();
              }}
              onLocalConfigSave={setLocalConfig}
            />
          )}

          {showCreateServer && (
            <CreateServerModal
              onClose={() => setShowCreateServer(false)}
              onCreated={(server) => {
                setShowCreateServer(false);
                void refreshServers();
                void refreshChannels();
                switchServer(server.id);
                if (server.channels.length > 0) {
                  handleSwitchChannel(server.channels[0].id);
                }
              }}
            />
          )}
        </div>
      </ThreadProvider>
    </ClaudeActionsProvider>
  );
}
