import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChannelMessage, Channel, LocalChannelConfig, MiddlePanelView, TicketStatus } from './types';
import { gql } from '@apollo/client';
import { MESSAGE_FIELDS } from './graphql/fragments';
import { useUpdateMessageStatusMutation, useDeleteMessageMutation, useSetTicketDependenciesMutation, useRemoveTicketDependencyMutation, useUpdateQueuedRunConfigMutation } from './__generated__/App.generated';
import { buildThreadNodes } from './utils';
import { useMessages } from './hooks/useMessages';
import { useThread } from './hooks/useThread';
import { useThreadScroll } from './hooks/useThreadScroll';
import { usePanelResize } from './hooks/usePanelResize';
import { useChannelSubscriptions } from './hooks/useChannelSubscriptions';
import { useStartupTerminals } from './hooks/useStartupTerminals';
import { useClaudeMessageActions } from './hooks/useClaudeMessageActions';
import { useMergePolling } from './hooks/useMergePolling';
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

const GQL_UPDATE_MESSAGE_STATUS = gql`
  mutation UpdateMessageStatus($channelId: ID!, $messageId: ID!, $status: String!) {
    updateMessageStatus(channelId: $channelId, messageId: $messageId, status: $status) {
      ...MessageFields
    }
  }
  ${MESSAGE_FIELDS}
`;

const GQL_DELETE_MESSAGE = gql`
  mutation DeleteMessage($channelId: ID!, $messageId: ID!) {
    deleteMessage(channelId: $channelId, messageId: $messageId)
  }
`;

const GQL_SET_TICKET_DEPENDENCIES = gql`
  mutation SetTicketDependencies($channelId: ID!, $messageId: ID!, $dependsOnMessageIds: [ID!]!, $runConfig: JSON!) {
    setTicketDependencies(channelId: $channelId, messageId: $messageId, dependsOnMessageIds: $dependsOnMessageIds, runConfig: $runConfig) {
      ...MessageFields
    }
  }
  ${MESSAGE_FIELDS}
`;

const GQL_REMOVE_TICKET_DEPENDENCY = gql`
  mutation RemoveTicketDependency($channelId: ID!, $messageId: ID!, $dependsOnMessageId: ID!) {
    removeTicketDependency(channelId: $channelId, messageId: $messageId, dependsOnMessageId: $dependsOnMessageId)
  }
`;

const GQL_UPDATE_QUEUED_RUN_CONFIG = gql`
  mutation UpdateQueuedRunConfig($messageId: ID!, $runConfig: JSON!) {
    updateQueuedRunConfig(messageId: $messageId, runConfig: $runConfig)
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
  } = useChannelContext();

  const {
    messages,
    messagesRef,
    upsertMessage,
    removeMessage,
    refreshMessages,
    clearMessages,
  } = useMessages();

  const activeChannelRef = useRef<Channel | null>(null);
  activeChannelRef.current = enrichedActiveChannel;

  const getChannelRepoPath = useCallback(() => activeChannelRef.current?.localRepoPath ?? '', []);
  const getChannelBaseBranch = useCallback(() => activeChannelRef.current?.baseBranch ?? 'main', []);

  const getActiveChannelId = useCallback(() => activeChannelId, [activeChannelId]);

  const {
    selectedMessageId,
    selectedMessageRef,
    selectedMessageIdRef,
    threadEvents,
    threadEventsRef,
    threadWidth,
    setThreadWidth,
    activeThreadId,
    activeThreadIdRef,
    threads,
    threadStatus,
    deletingWorktree,
    hasWorktree,
    setHasWorktree,
    expandedReadGroupIds,
    reportClaudeActivity,
    closeThreadPanel,
    loadThreadEvents,
    loadOlderEvents,
    appendThreadEvent,
    updateThreadEvent,
    hasMoreEvents,
    loadingOlderEvents,
    openThreadPanel,
    switchThread,
    clearThread,
    deleteWorktree,
    toggleReadGroup,
    syncSelectedMessage,
  } = useThread({ getChannelRepoPath, getChannelBaseBranch, getActiveChannelId });

  const upsertAndSyncMessage = useCallback(
    (message: ChannelMessage) => {
      upsertMessage(message);
      syncSelectedMessage(message);
    },
    [upsertMessage, syncSelectedMessage],
  );

  const {
    threadContentRef,
    showJumpToLatest,
    scrollThreadToBottom,
    onThreadScroll,
    resetScroll,
  } = useThreadScroll({
    threadEvents,
    selectedMessageId,
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
    selectMessage: selectTerminalMessage,
    initializeDefaults: initializeTerminalDefaults,
    rerunTab,
    stopTab,
    killAllForMessage: killTerminalsForMessage,
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

  const [executeUpdateMessageStatus] = useUpdateMessageStatusMutation();
  const [executeDeleteMessage] = useDeleteMessageMutation();
  const [executeSetTicketDependencies] = useSetTicketDependenciesMutation();
  const [executeRemoveTicketDependency] = useRemoveTicketDependencyMutation();
  const [executeUpdateQueuedRunConfig] = useUpdateQueuedRunConfigMutation();

  const [middlePanelView, setMiddlePanelView] = useState<MiddlePanelView>('chat');
  const [channelWidth, setChannelWidth] = useState(220);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [attentionMessageIds, setAttentionMessageIds] = useState<Set<string>>(new Set());
  const [settingsChannelId, setSettingsChannelId] = useState<string | null>(null);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showCreateServer, setShowCreateServer] = useState(false);
  const savedWidthsRef = useRef({ channel: 220, thread: 0 });
  const autoRunRef = useRef<((messageId: string, runConfig: unknown) => void) | null>(null);
  const autoReviewRef = useRef<((messageId: string, claudeSessionId: string | null) => void) | null>(null);

  const { dragging, startDragging } = usePanelResize(setChannelWidth, setThreadWidth, SERVER_RAIL_WIDTH);

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  }, []);

  const handleNeedsAttention = useCallback(
    (messageId: string, reason: 'stopped' | 'ask-user-question' | 'completed' | 'merged' | 'needs_input') => {
      setAttentionMessageIds((current) => {
        if (current.has(messageId)) return current;
        const next = new Set(current);
        next.add(messageId);
        return next;
      });

      if (!document.hasFocus() && 'Notification' in window && Notification.permission === 'granted') {
        const NOTIFICATION_TITLES: Record<string, string> = {
          'ask-user-question': 'Input needed',
          'needs_input': 'Input needed',
          'merged': 'Branch merged',
        };
        const title = NOTIFICATION_TITLES[reason] ?? 'Chat completed';
        const message = messagesRef.current.find((item) => item.id === messageId);
        const body = message?.preview || message?.session.cwd || messageId;
        const notification = new Notification(title, { body });
        notification.onclick = () => {
          void window.traceAPI.focusWindow();
        };
      }
    },
    [messagesRef],
  );

  const updateMessageStatus = useCallback(
    async (messageId: string, status: TicketStatus) => {
      if (!activeChannelId) return;
      try {
        const { data } = await executeUpdateMessageStatus({
          variables: {
            channelId: activeChannelId,
            messageId,
            status,
          },
        });

        if (!data) return;
        upsertAndSyncMessage(data.updateMessageStatus as ChannelMessage);
      } catch {
        console.error('Failed to update message status');
      }
    },
    [activeChannelId, executeUpdateMessageStatus, upsertAndSyncMessage],
  );

  const { triggerCheck: triggerMergeCheck } = useMergePolling({
    messagesRef,
    getRepoPath: getChannelRepoPath,
    getBaseBranch: getChannelBaseBranch,
    updateMessageStatus,
  });

  const { subscriptionsActive } = useChannelSubscriptions({
    activeChannelId,
    upsertMessage: upsertAndSyncMessage,
    removeMessage,
    appendThreadEvent,
    updateThreadEvent,
    reportClaudeActivity,
    selectedMessageIdRef,
    activeThreadIdRef,
    messagesRef,
    onNeedsAttention: handleNeedsAttention,
    upsertTicket,
    onTicketReadyToRun: useCallback((messageId: string, runConfig: unknown) => {
      autoRunRef.current?.(messageId, runConfig);
    }, []),
    onMessageReadyForReview: useCallback((messageId: string, claudeSessionId: string | null) => {
      autoReviewRef.current?.(messageId, claudeSessionId);
    }, []),
    onMessageCompleted: triggerMergeCheck,
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

  const handleDeleteMessage = useCallback(
    async (messageId: string) => {
      if (!activeChannelId) return;
      if (!window.confirm('Delete this message?')) return;

      if (selectedMessageId === messageId) {
        closeThreadPanel();
      }

      try {
        await executeDeleteMessage({
          variables: { channelId: activeChannelId, messageId },
        });
        removeMessage(messageId);
        killTerminalsForMessage(messageId);
        void window.traceAPI.releasePorts(messageId);
        void window.traceAPI.deleteWorktree(messageId, getChannelRepoPath());
      } catch {
        console.error('Failed to delete message');
      }
    },
    [activeChannelId, selectedMessageId, closeThreadPanel, executeDeleteMessage, removeMessage, getChannelRepoPath],
  );

  const threadNodes = useMemo(() => buildThreadNodes(threadEvents), [threadEvents]);
  const selectedMessageStatus: TicketStatus = useMemo(() => {
    const selected = messages.find((message) => message.id === selectedMessageId);
    return (selected?.status ?? 'pending') as TicketStatus;
  }, [messages, selectedMessageId]);

  const selectedMessageQueuedRunConfig = useMemo(() => {
    const selected = messages.find((message) => message.id === selectedMessageId);
    return selected?.queuedRunConfig ?? null;
  }, [messages, selectedMessageId]);

  const selectedTicket = useMemo(() => {
    if (!selectedMessageId) return null;
    for (const col of kanbanColumns) {
      const found = col.tickets.find((t) => t.messageId === selectedMessageId);
      if (found) return found;
    }
    return null;
  }, [kanbanColumns, selectedMessageId]);

  const channelTickets = useMemo(
    () =>
      kanbanColumns.flatMap((col) =>
        col.tickets.map((t) => ({
          messageId: t.messageId,
          title: t.title,
          status: t.message?.status ?? 'pending',
        })),
      ),
    [kanbanColumns],
  );

  const handleSetTicketDependencies = useCallback(
    async (messageId: string, depIds: string[], runConfig: { prompt: string; model: string; effort: string; planMode: boolean }) => {
      if (!activeChannelId) return;
      try {
        const { data } = await executeSetTicketDependencies({
          variables: {
            channelId: activeChannelId,
            messageId,
            dependsOnMessageIds: depIds,
            runConfig,
          },
        });
        if (data?.setTicketDependencies) {
          upsertAndSyncMessage(data.setTicketDependencies as ChannelMessage);
        }
      } catch {
        console.error('Failed to set ticket dependencies');
      }
    },
    [activeChannelId, executeSetTicketDependencies, upsertAndSyncMessage],
  );

  const handleRemoveTicketDependency = useCallback(
    async (messageId: string, dependsOnMessageId: string) => {
      if (!activeChannelId) return;
      try {
        await executeRemoveTicketDependency({
          variables: { channelId: activeChannelId, messageId, dependsOnMessageId },
        });
      } catch {
        console.error('Failed to remove ticket dependency');
      }
    },
    [activeChannelId, executeRemoveTicketDependency],
  );

  const handleUpdateQueuedRunConfig = useCallback(
    async (messageId: string, runConfig: { prompt: string; model: string; effort: string; planMode: boolean }) => {
      try {
        await executeUpdateQueuedRunConfig({
          variables: { messageId, runConfig },
        });
      } catch {
        console.error('Failed to update queued run config');
      }
    },
    [executeUpdateQueuedRunConfig],
  );

  const handleOpenThread = useCallback(
    (message: ChannelMessage) => {
      resetScroll();
      openThreadPanel(message);
      setMiddlePanelView('workspaces');
      setAttentionMessageIds((current) => {
        if (!current.has(message.id)) return current;
        const next = new Set(current);
        next.delete(message.id);
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

  const claudeActions = useClaudeMessageActions({
    activeChannelId,
    selectedMessageId,
    selectedMessageRef,
    selectedMessageIdRef,
    activeThreadIdRef,
    threadEventsRef,
    clearThread,
    onMessageCreated: handleOpenThread,
    loadThreadEvents,
    upsertMessage: upsertAndSyncMessage,
    setHasWorktree,
    updateMessageStatus,
    getSetupCommands,
    getChannelRepoPath,
    getChannelBaseBranch,
    getSystemInstructions,
  });

  // Populate autoRunRef so the subscription callback can call autoRunQueuedTicket
  useEffect(() => {
    autoRunRef.current = (messageId: string, runConfig: unknown) => {
      const config = runConfig as { prompt: string; model: string; effort: string; planMode: boolean };
      void claudeActions.autoRunQueuedTicket(messageId, config);
    };
  }, [claudeActions.autoRunQueuedTicket]);

  // Populate autoReviewRef so the subscription callback can call autoReviewMessage
  useEffect(() => {
    autoReviewRef.current = (messageId: string, claudeSessionId: string | null) => {
      void claudeActions.autoReviewMessage(messageId, claudeSessionId);
    };
  }, [claudeActions.autoReviewMessage]);

  const repoPath = enrichedActiveChannel?.localRepoPath ?? '';
  const claudeActionsContextValue = useMemo(
    () => ({
      repoPath,
      pendingRunMessageId: claudeActions.pendingRunMessageId,
      pendingRunInitialPrompt: claudeActions.pendingRunInitialPrompt,
      selectedModel: claudeActions.selectedModel,
      selectedEffort: claudeActions.selectedEffort,
      setSelectedModel: claudeActions.setSelectedModel,
      setSelectedEffort: claudeActions.setSelectedEffort,
      sendMessage: claudeActions.sendMessage,
      runPendingMessage: claudeActions.runPendingMessage,
      autoRunQueuedTicket: claudeActions.autoRunQueuedTicket,
      stopClaude: claudeActions.stopClaude,
      sendThreadMessage: claudeActions.sendThreadMessage,
      sendPlanResponse: claudeActions.sendPlanResponse,
      mergeToMain: claudeActions.mergeToMain,
      markMerged: claudeActions.markMerged,
      clearPendingRun: claudeActions.clearPendingRun,
      autoReviewMessage: claudeActions.autoReviewMessage,
    }),
    [
      repoPath,
      claudeActions.pendingRunMessageId,
      claudeActions.pendingRunInitialPrompt,
      claudeActions.selectedModel,
      claudeActions.selectedEffort,
      claudeActions.setSelectedModel,
      claudeActions.setSelectedEffort,
      claudeActions.sendMessage,
      claudeActions.runPendingMessage,
      claudeActions.autoRunQueuedTicket,
      claudeActions.stopClaude,
      claudeActions.sendThreadMessage,
      claudeActions.sendPlanResponse,
      claudeActions.mergeToMain,
      claudeActions.markMerged,
      claudeActions.clearPendingRun,
      claudeActions.autoReviewMessage,
    ],
  );

  const isMessageSpawned = claudeActions.isMessageSpawned;
  const isClaudeRunning = useMemo(() => {
    if (!selectedMessageId || !isMessageSpawned(selectedMessageId)) return false;
    // After /clear, the thread is empty – Claude isn't running on it
    if (threadStatus === 'empty') return false;
    const lastEvent = threadEvents[threadEvents.length - 1];
    if (lastEvent?.hookEventName === 'Stop') return false;
    const message = messages.find((item) => item.id === selectedMessageId);
    return message ? message.session.status !== 'stopped' : false;
  }, [isMessageSpawned, messages, selectedMessageId, threadEvents, threadStatus]);

  useEffect(() => {
    if (activeChannelId) {
      void refreshMessages(activeChannelId);
      void fetchBoard(activeChannelId);
    }
  }, [activeChannelId, refreshMessages, fetchBoard]);

  // Fetch AI chats when server changes
  useEffect(() => {
    if (activeServerId) {
      void fetchAiChats(activeServerId);
    }
  }, [activeServerId, fetchAiChats]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!activeChannelId || subscriptionsActive) return;
      void refreshMessages(activeChannelId);
      if (selectedMessageRef.current) {
        void loadThreadEvents(selectedMessageRef.current);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [activeChannelId, loadThreadEvents, refreshMessages, selectedMessageRef, subscriptionsActive]);

  // Sync terminal selection with message selection
  useEffect(() => {
    selectTerminalMessage(selectedMessageId);
  }, [selectedMessageId, selectTerminalMessage]);

  const handleSwitchChannel = useCallback(
    (channelId: string) => {
      if (selectedMessageId) {
        void window.traceAPI.releasePorts(selectedMessageId);
      }
      setActiveAiChatId(null);
      switchChannel(channelId);
      clearMessages();
      clearBoard();
      setMiddlePanelView('chat');
      closeThreadPanel();
      setChannelWidth(220);
      killAllTerminals();
    },
    [switchChannel, clearMessages, clearBoard, closeThreadPanel, killAllTerminals, selectedMessageId],
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
    if (!selectedMessageId || !currentRepoPath) return;
    const result = await window.traceAPI.checkWorktreeExists(selectedMessageId, currentRepoPath);
    if (!result.success || !result.exists || !result.worktreePath) return;

    savedWidthsRef.current = { channel: channelWidth, thread: threadWidth };
    setChannelWidth(0);
    setIsFullscreen(true);
  }, [channelWidth, getChannelRepoPath, selectedMessageId, threadWidth]);

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
    if (!selectedMessageId || !activeChannelId || !repoPath) return;
    const worktreeResult = await window.traceAPI.checkWorktreeExists(selectedMessageId, repoPath);
    if (!worktreeResult.success || !worktreeResult.exists || !worktreeResult.worktreePath) return;

    const channel = enrichedChannels.find((item) => item.id === activeChannelId);
    const setupScript = channel?.setupScript;
    const runScript = channel?.runScript;

    let env: Record<string, string> | undefined;
    if (runScript?.trim()) {
      const portResult = await window.traceAPI.allocatePorts(selectedMessageId, 10);
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

    initializeTerminalDefaults(selectedMessageId, worktreeResult.worktreePath, setupScript ?? undefined, runScript ?? undefined, env);
  }, [activeChannelId, enrichedChannels, repoPath, initializeTerminalDefaults, selectedMessageId]);

  const handleRerunScript = useCallback(async (tabName: string) => {
    if (!selectedMessageId || !activeChannelId || !repoPath) return;
    const worktreeResult = await window.traceAPI.checkWorktreeExists(selectedMessageId, repoPath);
    if (!worktreeResult.success || !worktreeResult.exists || !worktreeResult.worktreePath) return;

    const channel = enrichedChannels.find((item) => item.id === activeChannelId);
    const script = tabName === 'Setup' ? channel?.setupScript : channel?.runScript;
    if (!script?.trim()) return;

    let env: Record<string, string> | undefined;
    if (tabName === 'Run') {
      // Release old ports, allocate fresh ones
      await window.traceAPI.releasePorts(selectedMessageId);
      const portResult = await window.traceAPI.allocatePorts(selectedMessageId, 10);
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
  }, [activeChannelId, enrichedChannels, repoPath, rerunTab, selectedMessageId]);

  // Initialize terminal tabs (and run setup script) when a worktree is detected
  useEffect(() => {
    if (hasWorktree === true && selectedMessageId) {
      void handleInitializeTerminals();
    }
  }, [hasWorktree, selectedMessageId, handleInitializeTerminals]);

  const handleDeleteWorktree = useCallback(() => {
    if (selectedMessageId) {
      killTerminalsForMessage(selectedMessageId);
      void window.traceAPI.releasePorts(selectedMessageId);
    }
    void deleteWorktree((messageId) => void updateMessageStatus(messageId, 'completed'));
  }, [killTerminalsForMessage, selectedMessageId, deleteWorktree, updateMessageStatus]);

  const scriptsAvailable = Boolean(activeChannelId && hasWorktree === true);
  const displayChannel = enrichedActiveChannel ?? serverChannels[0] ?? null;
  const panelTitle = displayChannel ? `# ${displayChannel.name}` : '';
  const activeChannelRepoPath = enrichedActiveChannel?.localRepoPath ?? '';
  const activeChannelBaseBranch = enrichedActiveChannel?.baseBranch ?? 'main';

  // High-frequency context: changes on every SSE event
  const threadEventsContextValue = useMemo(
    () => ({
      threadEvents,
      threadNodes,
      threadStatus,
      hasMoreEvents,
      loadingOlderEvents,
      threadContentRef,
      showJumpToLatest,
      scrollToLatest: () => scrollThreadToBottom('smooth'),
      onThreadScroll,
    }),
    [
      threadEvents, threadNodes, threadStatus, hasMoreEvents, loadingOlderEvents,
      threadContentRef, showJumpToLatest, scrollThreadToBottom, onThreadScroll,
    ],
  );

  // Session-level context: changes infrequently
  const threadContextValue = useMemo(
    () => ({
      selectedMessageId,
      activeThreadId,
      threads,
      threadWidth: isFullscreen ? 9999 : threadWidth,
      deletingWorktree,
      hasWorktree,
      expandedReadGroupIds,
      openThreadPanel,
      closeThreadPanel,
      toggleReadGroup,
      setHasWorktree,
      setThreadWidth,
      loadThreadEvents,
      deleteWorktree,
      switchThread,
      clearThread,
      channelTickets,
      setTicketDependencies: handleSetTicketDependencies,
      removeTicketDependency: handleRemoveTicketDependency,
      updateQueuedRunConfig: handleUpdateQueuedRunConfig,
      isClaudeRunning,
      messageStatus: selectedMessageStatus,
      queuedRunConfig: selectedMessageQueuedRunConfig,
      selectedTicket,
      isFullscreen,
      scriptsAvailable,
      dragging,
      onClose: handleCloseThread,
      onDeleteWorktree: handleDeleteWorktree,
      onInitializeTerminals: (): void => { void handleInitializeTerminals(); },
      onRerunScript: (tabName: string): void => { void handleRerunScript(tabName); },
      onStopScript: stopTab,
      runScriptRunning: terminalList.some((t) => t.name === 'Run' && Boolean(t.command)),
      onStartDrag: () => startDragging('right'),
      onEnterFullscreen: (): void => { void enterFullscreen(); },
      onExitFullscreen: exitFullscreen,
      baseBranch: activeChannelBaseBranch,
      terminals: terminalList,
      terminalsInitialized,
      activeTerminalTabId: activeTabId,
      terminalCwd: terminalsCwd || activeChannelRepoPath,
      onSelectTerminalTab: setActiveTabId,
      onCloseTerminalTab: killTerminal,
      onCloseAllTerminals: (): void => { if (selectedMessageId) killTerminalsForMessage(selectedMessageId); },
      onAddTerminal: addTerminal,
    }),
    [
      selectedMessageId, activeThreadId, threads, threadWidth,
      deletingWorktree, hasWorktree, expandedReadGroupIds, openThreadPanel,
      closeThreadPanel, toggleReadGroup, setHasWorktree, setThreadWidth,
      loadThreadEvents, deleteWorktree, switchThread, clearThread,
      channelTickets, handleSetTicketDependencies, handleRemoveTicketDependency, handleUpdateQueuedRunConfig,
      isClaudeRunning, selectedMessageStatus, selectedMessageQueuedRunConfig, selectedTicket,
      isFullscreen, scriptsAvailable, dragging,
      handleCloseThread, handleDeleteWorktree, handleInitializeTerminals, handleRerunScript, stopTab,
      startDragging, enterFullscreen, exitFullscreen,
      activeChannelBaseBranch, terminalList, terminalsInitialized, activeTabId,
      terminalsCwd, activeChannelRepoPath, setActiveTabId,
      killTerminal, killTerminalsForMessage, addTerminal,
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
              onCreateChannel={() => setShowCreateChannel(true)}
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
                    channelCreatedAt={enrichedActiveChannel?.createdAt ?? null}
                    messages={messages}
                    selectedMessageId={selectedMessageId}
                    attentionMessageIds={attentionMessageIds}
                    onOpenThread={handleOpenThread}
                    onDeleteMessage={handleDeleteMessage}
                    middlePanelView={middlePanelView}
                    kanbanColumns={kanbanColumns}
                    kanbanLoading={kanbanLoading}
                    onMoveTicket={handleMoveTicket}
                    isFullscreen={isFullscreen}
                  />
                )}
              </div>
            </div>

          </div>

          {settingsChannel && (
            <ChannelSettingsModal
              channel={settingsChannel}
              localConfig={getLocalConfig(settingsChannel.id)}
              onClose={() => setSettingsChannelId(null)}
              onSave={handleSaveSettings}
            />
          )}

          {showCreateChannel && (
            <CreateChannelModal
              serverId={activeServerId}
              onClose={() => setShowCreateChannel(false)}
              onCreated={() => {
                setShowCreateChannel(false);
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
