import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChannelMessage, Channel, LocalChannelConfig, MiddlePanelView, TicketStatus } from './types';
import { SERVER_URL } from './types';
import { buildThreadNodes } from './utils';
import { useChannels } from './hooks/useChannels';
import { useMessages } from './hooks/useMessages';
import { useThread } from './hooks/useThread';
import { useThreadScroll } from './hooks/useThreadScroll';
import { usePanelResize } from './hooks/usePanelResize';
import { useSse } from './hooks/useSse';
import { useChannelSettings } from './hooks/useChannelSettings';
import { useStartupTerminals } from './hooks/useStartupTerminals';
import { useLocalConfig } from './hooks/useLocalConfig';
import { useClaudeMessageActions } from './hooks/useClaudeMessageActions';
import { useKanban } from './hooks/useKanban';
import { ClaudeActionsProvider } from './context/ClaudeActionsContext';
import { ChannelPanel } from './components/ChannelPanel';
import { MessagePanel } from './components/MessagePanel';
import { ThreadPanel } from './components/ThreadPanel';
import { WorktreeChanges } from './components/WorktreeChanges';
import { Terminal } from './components/Terminal';
import { ChannelSettingsModal } from './components/ChannelSettingsModal';
import { CreateChannelModal } from './components/CreateChannelModal';
import { TerminalTabs } from './components/TerminalTabs';

export default function App() {
  const {
    channels,
    activeChannelId,
    activeChannel,
    switchChannel,
    refreshChannels,
  } = useChannels();
  const {
    messages,
    messagesRef,
    upsertMessage,
    refreshMessages,
    clearMessages,
  } = useMessages();

  const activeChannelRef = useRef<Channel | null>(null);

  const getChannelRepoPath = useCallback(() => activeChannelRef.current?.localRepoPath ?? '', []);
  const getChannelBaseBranch = useCallback(() => activeChannelRef.current?.baseBranch ?? 'main', []);

  const {
    selectedMessageId,
    selectedMessageRef,
    selectedMessageIdRef,
    threadEvents,
    threadWidth,
    setThreadWidth,
    activeThreadId,
    threadStatus,
    deletingWorktree,
    hasWorktree,
    setHasWorktree,
    expandedReadGroupIds,
    reportClaudeActivity,
    closeThreadPanel,
    loadThreadEvents,
    openThreadPanel,
    deleteWorktree,
    toggleReadGroup,
  } = useThread({ getChannelRepoPath, getChannelBaseBranch });

  const {
    threadContentRef,
    showJumpToLatest,
    scrollThreadToBottom,
    onThreadScroll,
    resetScroll,
  } = useThreadScroll(threadEvents, selectedMessageId);

  const {
    updateChannel: updateChannelSettings,
  } = useChannelSettings();

  const {
    configs: localConfigs,
    getConfig: getLocalConfig,
    setConfig: setLocalConfig,
  } = useLocalConfig();

  const enrichedChannels: Channel[] = useMemo(
    () =>
      channels.map((ch) => {
        const local = localConfigs[ch.id];
        if (!local) return ch;
        return {
          ...ch,
          localRepoPath: local.localRepoPath ?? ch.localRepoPath,
          creationScript: local.creationScript ?? ch.creationScript,
        };
      }),
    [channels, localConfigs],
  );

  const enrichedActiveChannel = useMemo(
    () => enrichedChannels.find((ch) => ch.id === activeChannelId) ?? null,
    [enrichedChannels, activeChannelId],
  );
  activeChannelRef.current = enrichedActiveChannel;

  // One-time migration: copy DB localRepoPath/creationScript into local config
  const migrationRanRef = useRef(false);
  useEffect(() => {
    if (migrationRanRef.current || channels.length === 0 || Object.keys(localConfigs).length > 0) return;
    migrationRanRef.current = true;

    const migrateChannels = async () => {
      for (const ch of channels) {
        if (ch.localRepoPath && !localConfigs[ch.id]) {
          const config: LocalChannelConfig = {
            localRepoPath: ch.localRepoPath,
            creationScript: ch.creationScript ?? undefined,
          };
          // Fetch startup scripts from server for migration
          try {
            const res = await fetch(`${SERVER_URL}/channels/${ch.id}/startup-scripts`);
            if (res.ok) {
              const data = (await res.json()) as { scripts: { name: string; command: string }[] };
              if (data.scripts.length > 0) {
                config.startupScripts = data.scripts.map((s) => ({ name: s.name, command: s.command }));
              }
            }
          } catch {
            // ignore migration errors
          }
          await setLocalConfig(ch.id, config);
        }
      }
    };
    void migrateChannels();
  }, [channels, localConfigs, setLocalConfig]);

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

  const [middlePanelView, setMiddlePanelView] = useState<MiddlePanelView>('feed');
  const [channelWidth, setChannelWidth] = useState(220);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [worktreePath, setWorktreePath] = useState('');
  const [attentionMessageIds, setAttentionMessageIds] = useState<Set<string>>(
    new Set(),
  );
  const [settingsChannelId, setSettingsChannelId] = useState<string | null>(
    null,
  );
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const savedWidthsRef = useRef({ channel: 220, thread: 0 });

  const { dragging, startDragging } = usePanelResize(
    setChannelWidth,
    setThreadWidth,
  );

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  }, []);

  const handleNeedsAttention = useCallback(
    (
      messageId: string,
      reason: 'stopped' | 'ask-user-question' | 'completed',
    ) => {
      setAttentionMessageIds((current) => {
        if (current.has(messageId)) return current;
        const next = new Set(current);
        next.add(messageId);
        return next;
      });

      if (
        !document.hasFocus() &&
        'Notification' in window &&
        Notification.permission === 'granted'
      ) {
        const title =
          reason === 'ask-user-question' ? 'Input needed' : 'Chat completed';
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
    upsertMessage,
    loadThreadEvents,
    reportClaudeActivity,
    selectedMessageIdRef,
    messagesRef,
    selectedMessageRef,
    onNeedsAttention: handleNeedsAttention,
    upsertTicket,
  });

  const updateMessageStatus = useCallback(
    async (messageId: string, status: TicketStatus) => {
      if (!activeChannelId) return;
      try {
        const response = await fetch(
          `${SERVER_URL}/channels/${activeChannelId}/messages/${messageId}/status`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status }),
          },
        );
        if (!response.ok) return;
        const { message } = (await response.json()) as { message: ChannelMessage };
        upsertMessage(message);
      } catch {
        console.error('Failed to update message status');
      }
    },
    [activeChannelId, upsertMessage],
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

  const feedTitle = enrichedActiveChannel ? `# ${enrichedActiveChannel.name}` : 'Activity Feed';
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

  const claudeActions = useClaudeMessageActions({
    activeChannelId,
    selectedMessageId,
    selectedMessageRef,
    selectedMessageIdRef,
    onMessageCreated: handleOpenThread,
    loadThreadEvents,
    upsertMessage,
    setHasWorktree,
    updateMessageStatus,
    getCreationCommands,
    getChannelRepoPath,
    getChannelBaseBranch,
  });

  const claudeActionsContextValue = useMemo(
    () => ({
      pendingRunMessageId: claudeActions.pendingRunMessageId,
      pendingRunInitialPrompt: claudeActions.pendingRunInitialPrompt,
      sendMessage: claudeActions.sendMessage,
      runPendingMessage: claudeActions.runPendingMessage,
      stopClaude: claudeActions.stopClaude,
      sendThreadMessage: claudeActions.sendThreadMessage,
      sendPlanResponse: claudeActions.sendPlanResponse,
      mergeToMain: claudeActions.mergeToMain,
    }),
    [
      claudeActions.pendingRunMessageId,
      claudeActions.pendingRunInitialPrompt,
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
    if (!selectedMessageId || !isMessageSpawned(selectedMessageId)) {
      return false;
    }
    const lastEvent = threadEvents[threadEvents.length - 1];
    if (lastEvent?.hookEventName === 'Stop') return false;
    const message = messages.find((item) => item.id === selectedMessageId);
    return message ? message.session.status !== 'stopped' : false;
  }, [isMessageSpawned, messages, selectedMessageId, threadEvents]);

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
  }, [
    activeChannelId,
    loadThreadEvents,
    refreshMessages,
    selectedMessageRef,
    sseConnected,
  ]);

  const handleSwitchChannel = useCallback(
    (channelId: string) => {
      if (selectedMessageId) {
        void window.traceAPI.releasePorts(selectedMessageId);
      }
      switchChannel(channelId);
      clearMessages();
      clearBoard();
      setMiddlePanelView('feed');
      closeThreadPanel();
      setChannelWidth(220);
      killAllTerminals();
    },
    [
      switchChannel,
      clearMessages,
      clearBoard,
      closeThreadPanel,
      killAllTerminals,
      selectedMessageId,
    ],
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
  }, [
    channelWidth,
    selectedMessageId,
    showTerminals,
    startupTerminalList.length,
    threadWidth,
  ]);

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
      if (
        event.key === 't' &&
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        !event.altKey
      ) {
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

  const handleOpenSettings = useCallback(
    (channelId: string) => {
      setSettingsChannelId(channelId);
    },
    [],
  );

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
    if (
      !worktreeResult.success ||
      !worktreeResult.exists ||
      !worktreeResult.worktreePath
    ) {
      return;
    }

    const config = getLocalConfig(activeChannelId);
    const scripts = config?.startupScripts ?? [];
    if (scripts.length === 0) return;

    const portResult = await window.traceAPI.allocatePorts(
      selectedMessageId,
      scripts.length,
    );
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

    runAllScripts(
      selectedMessageId,
      worktreeResult.worktreePath,
      scripts,
      envMaps,
    );
  }, [activeChannelId, getLocalConfig, runAllScripts, selectedMessageId]);

  const scriptsAvailable = Boolean(activeChannelId && hasWorktree === true);
  const terminalId = `fullscreen-${selectedMessageId ?? 'none'}`;
  const activeChannelRepoPath = enrichedActiveChannel?.localRepoPath ?? '';
  const activeChannelBaseBranch = enrichedActiveChannel?.baseBranch ?? 'main';

  return (
    <ClaudeActionsProvider value={claudeActionsContextValue}>
      <div className="flex h-screen overflow-hidden bg-[#1a1b26] text-[#c0caf5]">
        <ChannelPanel
          channels={enrichedChannels}
          activeChannelId={activeChannelId}
          channelWidth={isFullscreen ? 0 : channelWidth}
          dragging={dragging}
          onSwitchChannel={handleSwitchChannel}
          onOpenSettings={handleOpenSettings}
          onRunStartupScripts={handleRunStartupScripts}
          onCreateChannel={() => setShowCreateChannel(true)}
          onStartDrag={() => startDragging('left')}
        />

        <div
          className="flex min-h-0 min-w-0 flex-col panel-animate"
          style={{
            flex: isFullscreen ? '0 0 0px' : '1 1 0%',
            overflow: 'hidden',
          }}
        >
          <div
            className={
              startupTerminalsVisible &&
              startupTerminalList.length > 0 &&
              !isFullscreen
                ? 'flex min-h-0 flex-1 flex-col overflow-hidden'
                : 'flex min-h-0 flex-1 flex-col'
            }
          >
            <MessagePanel
              feedTitle={feedTitle}
              messages={messages}
              selectedMessageId={selectedMessageId}
              attentionMessageIds={attentionMessageIds}
              onOpenThread={handleOpenThread}
              middlePanelView={middlePanelView}
              onSetView={handleSetView}
              kanbanColumns={kanbanColumns}
              kanbanLoading={kanbanLoading}
              onMoveTicket={handleMoveTicket}
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

        <ThreadPanel
          threadWidth={isFullscreen ? 9999 : threadWidth}
          dragging={dragging}
          threadStatus={threadStatus}
          activeThreadId={activeThreadId}
          threadNodes={threadNodes}
          expandedReadGroupIds={expandedReadGroupIds}
          selectedMessageId={selectedMessageId}
          messageStatus={selectedMessageStatus}
          ticket={selectedTicket}
          deletingWorktree={deletingWorktree}
          hasWorktree={hasWorktree}
          showJumpToLatest={showJumpToLatest}
          isClaudeRunning={isClaudeRunning}
          threadContentRef={threadContentRef}
          scriptsAvailable={scriptsAvailable}
          onRunScripts={() => void handleRunMessageScripts()}
          onThreadScroll={onThreadScroll}
          onToggleReadGroup={toggleReadGroup}
          onScrollToLatest={() => scrollThreadToBottom('smooth')}
          onClose={handleCloseThread}
          onDeleteWorktree={() => {
            killAllTerminals();
            if (selectedMessageId) {
              void window.traceAPI.releasePorts(selectedMessageId);
            }
            void deleteWorktree((messageId) =>
              void updateMessageStatus(messageId, 'completed'),
            );
          }}
          onStartDrag={() => startDragging('right')}
          isFullscreen={isFullscreen}
          onEnterFullscreen={() => void enterFullscreen()}
          onExitFullscreen={exitFullscreen}
        />

        <div
          className="flex min-h-0 flex-col panel-animate"
          style={{
            flex: isFullscreen ? '1 1 50%' : '0 0 0px',
            overflow: 'hidden',
          }}
        >
          <div className="min-h-0 flex-1 overflow-hidden border-b border-[#292e42]">
            {isFullscreen && <WorktreeChanges messageId={selectedMessageId} baseBranch={activeChannelBaseBranch} />}
          </div>
          <div
            className="overflow-hidden"
            style={{
              height: isFullscreen ? '40%' : '0',
              minHeight: isFullscreen ? '150px' : '0',
            }}
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
            onClose={() => setShowCreateChannel(false)}
            onCreated={() => {
              setShowCreateChannel(false);
              void refreshChannels();
            }}
            onLocalConfigSave={setLocalConfig}
          />
        )}
      </div>
    </ClaudeActionsProvider>
  );
}
