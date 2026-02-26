import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChannelMessage, Channel, LocalChannelConfig, MiddlePanelView, TicketStatus } from './types';
import { gql } from '@apollo/client';
import { MESSAGE_FIELDS } from './graphql/fragments';
import { useUpdateMessageStatusMutation, useDeleteMessageMutation } from './__generated__/App.generated';
import { buildThreadNodes } from './utils';
import { useMessages } from './hooks/useMessages';
import { useThread } from './hooks/useThread';
import { useThreadScroll } from './hooks/useThreadScroll';
import { usePanelResize } from './hooks/usePanelResize';
import { useSse } from './hooks/useSse';
import { useStartupTerminals } from './hooks/useStartupTerminals';
import { useClaudeMessageActions } from './hooks/useClaudeMessageActions';
import { useKanban } from './hooks/useKanban';
import { ClaudeActionsProvider } from './context/ClaudeActionsContext';
import { ChannelProvider, useChannelContext } from './context/ChannelContext';
import { ThreadProvider } from './context/ThreadContext';
import { ChannelPanel } from './components/ChannelPanel';
import { MessagePanel } from './components/MessagePanel';
import { ThreadPanel } from './components/ThreadPanel';
import { WorktreeChanges } from './components/WorktreeChanges';
import { Terminal } from './components/Terminal';
import { ChannelSettingsModal } from './components/ChannelSettingsModal';
import { CreateChannelModal } from './components/CreateChannelModal';
import { CreateServerModal } from './components/CreateServerModal';
import { ServerRail } from './components/ServerRail';
import { TerminalTabs } from './components/TerminalTabs';

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
    tokenUsage,
    latestContextTokens,
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
    terminals: startupTerminalList,
    activeTabId,
    setActiveTabId,
    isVisible: startupTerminalsVisible,
    runCwd: startupTerminalsCwd,
    showTerminals,
    runAllScripts,
    killAllTerminals,
    killTerminal,
    addTerminal,
  } = useStartupTerminals();

  const {
    columns: kanbanColumns,
    loading: kanbanLoading,
    fetchBoard,
    upsertTicket,
    moveTicket,
    clearBoard,
  } = useKanban();

  const [executeUpdateMessageStatus] = useUpdateMessageStatusMutation();
  const [executeDeleteMessage] = useDeleteMessageMutation();

  const [middlePanelView, setMiddlePanelView] = useState<MiddlePanelView>('chat');
  const [channelWidth, setChannelWidth] = useState(220);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [worktreePath, setWorktreePath] = useState('');
  const [attentionMessageIds, setAttentionMessageIds] = useState<Set<string>>(new Set());
  const [settingsChannelId, setSettingsChannelId] = useState<string | null>(null);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showCreateServer, setShowCreateServer] = useState(false);
  const savedWidthsRef = useRef({ channel: 220, thread: 0 });

  const { dragging, startDragging } = usePanelResize(setChannelWidth, setThreadWidth, SERVER_RAIL_WIDTH);

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  }, []);

  const handleNeedsAttention = useCallback(
    (messageId: string, reason: 'stopped' | 'ask-user-question' | 'completed') => {
      setAttentionMessageIds((current) => {
        if (current.has(messageId)) return current;
        const next = new Set(current);
        next.add(messageId);
        return next;
      });

      if (!document.hasFocus() && 'Notification' in window && Notification.permission === 'granted') {
        const title = reason === 'ask-user-question' ? 'Input needed' : 'Chat completed';
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

  const { sseConnected } = useSse({
    activeChannelId,
    upsertMessage: upsertAndSyncMessage,
    removeMessage,
    appendThreadEvent,
    updateThreadEvent,
    reportClaudeActivity,
    selectedMessageIdRef,
    activeThreadIdRef,
    messagesRef,
    selectedMessageRef,
    onNeedsAttention: handleNeedsAttention,
    upsertTicket,
  });

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
        setChannelWidth(220);
      }

      try {
        await executeDeleteMessage({
          variables: { channelId: activeChannelId, messageId },
        });
        removeMessage(messageId);
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

  const selectedTicket = useMemo(() => {
    if (!selectedMessageId) return null;
    for (const col of kanbanColumns) {
      const found = col.tickets.find((t) => t.messageId === selectedMessageId);
      if (found) return found;
    }
    return null;
  }, [kanbanColumns, selectedMessageId]);

  const handleOpenThread = useCallback(
    (message: ChannelMessage) => {
      setChannelWidth(0);
      resetScroll();
      openThreadPanel(message);
      setAttentionMessageIds((current) => {
        if (!current.has(message.id)) return current;
        const next = new Set(current);
        next.delete(message.id);
        return next;
      });
    },
    [openThreadPanel, resetScroll],
  );

  const getCreationCommands = useCallback((): string[] => {
    if (!enrichedActiveChannel?.creationScript) return [];
    return enrichedActiveChannel.creationScript
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
    getCreationCommands,
    getChannelRepoPath,
    getChannelBaseBranch,
    getSystemInstructions,
  });

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
      stopClaude: claudeActions.stopClaude,
      sendThreadMessage: claudeActions.sendThreadMessage,
      sendPlanResponse: claudeActions.sendPlanResponse,
      mergeToMain: claudeActions.mergeToMain,
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
      claudeActions.stopClaude,
      claudeActions.sendThreadMessage,
      claudeActions.sendPlanResponse,
      claudeActions.mergeToMain,
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

  useEffect(() => {
    const interval = setInterval(() => {
      if (!activeChannelId || sseConnected) return;
      void refreshMessages(activeChannelId);
      if (selectedMessageRef.current) {
        void loadThreadEvents(selectedMessageRef.current);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [activeChannelId, loadThreadEvents, refreshMessages, selectedMessageRef, sseConnected]);

  const handleSwitchChannel = useCallback(
    (channelId: string) => {
      if (selectedMessageId) {
        void window.traceAPI.releasePorts(selectedMessageId);
      }
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
      switchServer(serverId);
      const firstChannel = enrichedChannels.find((ch) => ch.serverId === serverId);
      if (firstChannel) {
        handleSwitchChannel(firstChannel.id);
      }
    },
    [switchServer, enrichedChannels, handleSwitchChannel],
  );

  const handleCloseThread = useCallback(() => {
    if (isFullscreen) {
      setIsFullscreen(false);
      setChannelWidth(savedWidthsRef.current.channel);
      setThreadWidth(savedWidthsRef.current.thread);
      return;
    }
    closeThreadPanel();
    setChannelWidth(220);
  }, [closeThreadPanel, isFullscreen, setThreadWidth]);

  const enterFullscreen = useCallback(async () => {
    if (!selectedMessageId) return;
    const result = await window.traceAPI.checkWorktreeExists(selectedMessageId);
    if (!result.success || !result.exists || !result.worktreePath) return;

    savedWidthsRef.current = { channel: channelWidth, thread: threadWidth };
    setWorktreePath(result.worktreePath);
    setChannelWidth(0);
    setIsFullscreen(true);
    if (startupTerminalList.length > 0) {
      showTerminals();
    }
  }, [channelWidth, selectedMessageId, showTerminals, startupTerminalList.length, threadWidth]);

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
    async (baseBranch: string | null, localConfig: LocalChannelConfig | null) => {
      if (!settingsChannelId) return;
      await updateChannelSettings(settingsChannelId, { baseBranch });
      if (localConfig) {
        await setLocalConfig(settingsChannelId, localConfig);
      }
      void refreshChannels();
    },
    [refreshChannels, settingsChannelId, updateChannelSettings, setLocalConfig],
  );

  const handleRunStartupScripts = useCallback(
    (channelId: string) => {
      const channel = enrichedChannels.find((item) => item.id === channelId);
      if (!channel?.localRepoPath) return;
      const config = getLocalConfig(channelId);
      const scripts = config?.startupScripts ?? [];
      if (scripts.length === 0) return;
      runAllScripts(channelId, channel.localRepoPath, scripts);
    },
    [enrichedChannels, getLocalConfig, runAllScripts],
  );

  const handleRunMessageScripts = useCallback(async () => {
    if (!selectedMessageId || !activeChannelId) return;
    const worktreeResult = await window.traceAPI.checkWorktreeExists(selectedMessageId);
    if (!worktreeResult.success || !worktreeResult.exists || !worktreeResult.worktreePath) return;

    const config = getLocalConfig(activeChannelId);
    const scripts = config?.startupScripts ?? [];
    if (scripts.length === 0) return;

    const portResult = await window.traceAPI.allocatePorts(selectedMessageId, scripts.length);
    if (!portResult.success || !portResult.ports) return;

    const ports = portResult.ports;
    const envMaps: Record<string, string>[] = scripts.map((_, scriptIndex) => {
      const env: Record<string, string> = {
        PORT: String(ports[scriptIndex]),
        TRACE_BASE_PORT: String(ports[0]),
      };
      for (let portIndex = 0; portIndex < ports.length; portIndex += 1) {
        env[`TRACE_PORT_${portIndex}`] = String(ports[portIndex]);
      }
      return env;
    });

    runAllScripts(selectedMessageId, worktreeResult.worktreePath, scripts, envMaps);
  }, [activeChannelId, getLocalConfig, runAllScripts, selectedMessageId]);

  const handleDeleteWorktree = useCallback(() => {
    killAllTerminals();
    if (selectedMessageId) {
      void window.traceAPI.releasePorts(selectedMessageId);
    }
    void deleteWorktree((messageId) => void updateMessageStatus(messageId, 'completed'));
  }, [killAllTerminals, selectedMessageId, deleteWorktree, updateMessageStatus]);

  const scriptsAvailable = Boolean(activeChannelId && hasWorktree === true);
  const panelTitle = enrichedActiveChannel ? `# ${enrichedActiveChannel.name}` : 'Workspaces';
  const terminalId = `fullscreen-${selectedMessageId ?? 'none'}`;
  const activeChannelRepoPath = enrichedActiveChannel?.localRepoPath ?? '';
  const activeChannelBaseBranch = enrichedActiveChannel?.baseBranch ?? 'main';

  const threadContextValue = useMemo(
    () => ({
      selectedMessageId,
      activeThreadId,
      threads,
      threadEvents,
      threadStatus,
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
      threadContentRef,
      showJumpToLatest,
      scrollToLatest: () => scrollThreadToBottom('smooth'),
      onThreadScroll,
      hasMoreEvents,
      loadingOlderEvents,
      tokenUsage,
      latestContextTokens,
      threadNodes,
      isClaudeRunning,
      messageStatus: selectedMessageStatus,
      selectedTicket,
      isFullscreen,
      scriptsAvailable,
      dragging,
      onClose: handleCloseThread,
      onDeleteWorktree: handleDeleteWorktree,
      onRunScripts: (): void => { void handleRunMessageScripts(); },
      onStartDrag: () => startDragging('right'),
      onEnterFullscreen: (): void => { void enterFullscreen(); },
      onExitFullscreen: exitFullscreen,
    }),
    [
      selectedMessageId, activeThreadId, threads, threadEvents, threadStatus, threadWidth,
      deletingWorktree, hasWorktree, expandedReadGroupIds, openThreadPanel,
      closeThreadPanel, toggleReadGroup, setHasWorktree, setThreadWidth,
      loadThreadEvents, deleteWorktree, switchThread, clearThread,
      threadContentRef, showJumpToLatest,
      scrollThreadToBottom, onThreadScroll, hasMoreEvents, loadingOlderEvents,
      tokenUsage, latestContextTokens, threadNodes, isClaudeRunning,
      selectedMessageStatus, selectedTicket, isFullscreen, scriptsAvailable,
      dragging, handleCloseThread, handleDeleteWorktree, handleRunMessageScripts,
      startDragging, enterFullscreen, exitFullscreen,
    ],
  );

  return (
    <ClaudeActionsProvider value={claudeActionsContextValue}>
      <ThreadProvider value={threadContextValue}>
        <div className="flex h-screen overflow-hidden bg-[#1a1b26] text-[#c0caf5]">
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
            onSwitchChannel={handleSwitchChannel}
            onOpenSettings={handleOpenSettings}
            onRunStartupScripts={handleRunStartupScripts}
            onCreateChannel={() => setShowCreateChannel(true)}
            onStartDrag={() => startDragging('left')}
          />

          <div
            className="flex min-h-0 min-w-0 flex-col panel-animate"
            style={{ flex: isFullscreen ? '0 0 0px' : '1 1 0%', overflow: 'hidden' }}
          >
            <div
              className={
                startupTerminalsVisible && startupTerminalList.length > 0 && !isFullscreen
                  ? 'flex min-h-0 flex-1 flex-col overflow-hidden'
                  : 'flex min-h-0 flex-1 flex-col'
              }
            >
              <MessagePanel
                panelTitle={panelTitle}
                channelCreatedAt={enrichedActiveChannel?.createdAt ?? null}
                messages={messages}
                selectedMessageId={selectedMessageId}
                attentionMessageIds={attentionMessageIds}
                onOpenThread={handleOpenThread}
                onDeleteMessage={handleDeleteMessage}
                middlePanelView={middlePanelView}
                onSetView={handleSetView}
                kanbanColumns={kanbanColumns}
                kanbanLoading={kanbanLoading}
                onMoveTicket={handleMoveTicket}
                onOpenSettings={() => activeChannelId && handleOpenSettings(activeChannelId)}
              />
            </div>

            {startupTerminalList.length > 0 && !isFullscreen && (
              <div
                className="shrink-0 border-t border-[#292e42]"
                style={{
                  height: startupTerminalsVisible ? '35%' : '0',
                  minHeight: startupTerminalsVisible ? '150px' : '0',
                  overflow: 'hidden',
                }}
              >
                <TerminalTabs
                  terminals={startupTerminalList}
                  activeTabId={activeTabId}
                  cwd={startupTerminalsCwd || activeChannelRepoPath}
                  onSelectTab={setActiveTabId}
                  onCloseTab={killTerminal}
                  onCloseAll={killAllTerminals}
                  onAddTab={addTerminal}
                />
              </div>
            )}
          </div>

          <ThreadPanel />

          <div
            className="flex min-h-0 flex-col panel-animate"
            style={{ flex: isFullscreen ? '1 1 50%' : '0 0 0px', overflow: 'hidden' }}
          >
            <div className="min-h-0 flex-1 overflow-hidden border-b border-[#292e42]">
              {isFullscreen && <WorktreeChanges messageId={selectedMessageId} baseBranch={activeChannelBaseBranch} />}
            </div>
            <div
              className="overflow-hidden"
              style={{ height: isFullscreen ? '40%' : '0', minHeight: isFullscreen ? '150px' : '0' }}
            >
              {isFullscreen && startupTerminalList.length > 0 ? (
                <TerminalTabs
                  terminals={startupTerminalList}
                  activeTabId={activeTabId}
                  cwd={activeChannelRepoPath}
                  onSelectTab={setActiveTabId}
                  onCloseTab={killTerminal}
                  onCloseAll={killAllTerminals}
                  onAddTab={addTerminal}
                />
              ) : isFullscreen ? (
                <Terminal terminalId={terminalId} cwd={worktreePath} />
              ) : null}
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
