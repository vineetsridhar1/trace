import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Channel, ChannelMessage, StartupScript, TicketStatus } from './types';
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
import { ChannelPanel } from './components/ChannelPanel';
import { MessagePanel } from './components/MessagePanel';
import { ThreadPanel } from './components/ThreadPanel';
import { WorktreeChanges } from './components/WorktreeChanges';
import { Terminal } from './components/Terminal';
import { ChannelSettingsModal } from './components/ChannelSettingsModal';
import type { DraftScript } from './components/ChannelSettingsModal';
import { TerminalTabs } from './components/TerminalTabs';

export default function App() {
  const { channels, activeChannelId, activeChannel, switchChannel, refreshChannels } = useChannels();
  const { messages, messagesRef, upsertMessage, refreshMessages, clearMessages } = useMessages();

  const thread = useThread();
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
  } = thread;

  const scroll = useThreadScroll(threadEvents);
  const { threadContentRef, showJumpToLatest, scrollThreadToBottom, onThreadScroll, resetScroll } = scroll;

  const channelSettings = useChannelSettings();
  const { scripts, fetchScripts, updateChannelCwd, addScript, updateScript, deleteScript } = channelSettings;

  const startupTerminals = useStartupTerminals();
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
  } = startupTerminals;

  const [channelWidth, setChannelWidth] = useState(220);
  const [messageInput, setMessageInput] = useState('');
  const [threadInput, setThreadInput] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [worktreePath, setWorktreePath] = useState('');
  const [pendingRunMessageId, setPendingRunMessageId] = useState<string | null>(null);
  const [pendingRunPrompt, setPendingRunPrompt] = useState('');
  const [attentionMessageIds, setAttentionMessageIds] = useState<Set<string>>(new Set());
  const [settingsChannelId, setSettingsChannelId] = useState<string | null>(null);
  const savedWidthsRef = useRef({ channel: 220, thread: 0 });
  const spawnedMessageIds = useRef(new Set<string>());

  const { dragging, startDragging } = usePanelResize(setChannelWidth, setThreadWidth);

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  }, []);

  const handleNeedsAttention = useCallback(
    (messageId: string, reason: 'stopped' | 'ask-user-question' | 'completed') => {
      setAttentionMessageIds((prev) => {
        if (prev.has(messageId)) return prev;
        const next = new Set(prev);
        next.add(messageId);
        return next;
      });

      if (!document.hasFocus() && 'Notification' in window && Notification.permission === 'granted') {
        const title = reason === 'ask-user-question' ? 'Input needed' : 'Chat completed';
        const msg = messagesRef.current.find((m) => m.id === messageId);
        const body = msg?.preview || msg?.session.cwd || messageId;
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
  });

  const updateMessageStatus = useCallback(
    async (messageId: string, status: string) => {
      if (!activeChannelId) return;
      try {
        const res = await fetch(
          `${SERVER_URL}/channels/${activeChannelId}/messages/${messageId}/status`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status }),
          },
        );
        if (!res.ok) return;
        const { message } = (await res.json()) as { message: ChannelMessage };
        upsertMessage(message);
      } catch {
        console.error('Failed to update message status');
      }
    },
    [activeChannelId, upsertMessage],
  );

  const feedTitle = activeChannel ? `# ${activeChannel.name}` : 'Activity Feed';
  const threadNodes = useMemo(() => buildThreadNodes(threadEvents), [threadEvents]);
  const selectedMessageStatus: TicketStatus = useMemo(() => {
    const msg = messages.find((m) => m.id === selectedMessageId);
    return (msg?.status ?? 'pending') as TicketStatus;
  }, [messages, selectedMessageId]);

  const isClaudeRunning = useMemo(() => {
    if (!selectedMessageId || !spawnedMessageIds.current.has(selectedMessageId)) return false;
    // If the last thread event is a Stop, Claude is definitely not running
    if (threadEvents.length > 0 && threadEvents[threadEvents.length - 1].hookEventName === 'Stop') return false;
    const msg = messages.find((m) => m.id === selectedMessageId);
    return msg ? msg.session.status !== 'stopped' : false;
  }, [messages, selectedMessageId, threadEvents]);

  useEffect(() => {
    if (activeChannelId) void refreshMessages(activeChannelId);
  }, [activeChannelId, refreshMessages]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!activeChannelId || sseConnected) return;
      void refreshMessages(activeChannelId);
      if (selectedMessageRef.current) void loadThreadEvents(selectedMessageRef.current);
    }, 3000);
    return () => clearInterval(interval);
  }, [activeChannelId, loadThreadEvents, refreshMessages, selectedMessageRef, sseConnected]);

  const handleSwitchChannel = useCallback(
    (channelId: string) => {
      // Release ports for any running message scripts before switching
      if (selectedMessageId) {
        void window.traceAPI.releasePorts(selectedMessageId);
      }
      switchChannel(channelId);
      clearMessages();
      closeThreadPanel();
      setChannelWidth(220);
      killAllTerminals();
    },
    [switchChannel, clearMessages, closeThreadPanel, killAllTerminals, selectedMessageId],
  );

  const handleOpenThread = useCallback(
    (message: ChannelMessage) => {
      setChannelWidth(0);
      resetScroll();
      openThreadPanel(message);
      setAttentionMessageIds((prev) => {
        if (!prev.has(message.id)) return prev;
        const next = new Set(prev);
        next.delete(message.id);
        return next;
      });
    },
    [openThreadPanel, resetScroll],
  );

  const sendMessage = useCallback(async () => {
    const text = messageInput.trim();
    if (!text || !activeChannelId) return;

    setMessageInput('');
    try {
      const res = await fetch(`${SERVER_URL}/channels/${activeChannelId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) return;

      const { message } = (await res.json()) as { message: ChannelMessage };
      upsertMessage(message);
      handleOpenThread(message);
      setPendingRunMessageId(message.id);
      setPendingRunPrompt(text);
    } catch {
      console.error('Failed to send message');
    }
  }, [messageInput, activeChannelId, upsertMessage, handleOpenThread]);

  const runMessage = useCallback(async (planMode: boolean) => {
    if (!pendingRunMessageId || !pendingRunPrompt) return;

    const prompt = planMode
      ? `Before implementing, first create a detailed plan and present it for review. Use plan mode. Once the plan is approved, proceed with implementation.\n\n${pendingRunPrompt}`
      : pendingRunPrompt;

    const messageId = pendingRunMessageId;
    setPendingRunMessageId(null);
    setPendingRunPrompt('');

    // Update the message preview in DB so the card stays in sync with edits
    if (activeChannelId) {
      try {
        const patchRes = await fetch(
          `${SERVER_URL}/channels/${activeChannelId}/messages/${messageId}/preview`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ preview: pendingRunPrompt }),
          },
        );
        if (patchRes.ok) {
          const { message } = (await patchRes.json()) as { message: ChannelMessage };
          upsertMessage(message);
        }
      } catch {
        // non-critical, continue with spawn
      }
    }

    spawnedMessageIds.current.add(messageId);
    const result = await window.traceAPI.spawnClaude(messageId, prompt);
    if (result.success) {
      setHasWorktree(true);
      void updateMessageStatus(messageId, 'in_progress');
    } else {
      spawnedMessageIds.current.delete(messageId);
      console.error('Failed to spawn claude:', result.error);
    }
  }, [pendingRunMessageId, pendingRunPrompt, activeChannelId, upsertMessage, setHasWorktree, updateMessageStatus]);

  const stopClaude = useCallback(async () => {
    if (!selectedMessageId) return;
    await window.traceAPI.stopClaude(selectedMessageId);
  }, [selectedMessageId]);

  const sendThreadMessage = useCallback(async () => {
    const text = threadInput.trim();
    const message = selectedMessageRef.current;
    if (!text || !message || !activeChannelId) return;

    setThreadInput('');
    try {
      const persistRes = await fetch(
        `${SERVER_URL}/channels/${activeChannelId}/messages/${message.id}/prompts`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        },
      );
      if (!persistRes.ok) {
        console.error('Failed to persist thread prompt');
        return;
      }

      const { message: updated } = (await persistRes.json()) as { message: ChannelMessage };
      upsertMessage(updated);
      if (selectedMessageIdRef.current === updated.id) void loadThreadEvents(updated);

      spawnedMessageIds.current.add(message.id);
      const result = await window.traceAPI.spawnClaude(message.id, text);
      if (result.success) {
        setHasWorktree(true);
        void updateMessageStatus(message.id, 'in_progress');
      } else {
        spawnedMessageIds.current.delete(message.id);
        console.error('Failed to spawn claude:', result.error);
      }
    } catch {
      console.error('Failed to send thread message');
    }
  }, [activeChannelId, threadInput, selectedMessageRef, selectedMessageIdRef, upsertMessage, loadThreadEvents, setHasWorktree, updateMessageStatus]);

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
    // Show startup terminals in the fullscreen view if they exist
    if (startupTerminalList.length > 0) {
      showTerminals();
    }
  }, [selectedMessageId, channelWidth, threadWidth, startupTerminalList.length, showTerminals]);

  const exitFullscreen = useCallback(() => {
    setIsFullscreen(false);
    setChannelWidth(savedWidthsRef.current.channel);
    setThreadWidth(savedWidthsRef.current.thread);
  }, [setThreadWidth]);

  // Auto-exit fullscreen if worktree gets deleted
  useEffect(() => {
    if (isFullscreen && hasWorktree === false) {
      exitFullscreen();
    }
  }, [isFullscreen, hasWorktree, exitFullscreen]);

  // Cmd+T / Ctrl+T to add a new terminal tab
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 't' && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        addTerminal();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [addTerminal]);

  const sendPlanResponse = useCallback(async (text: string, claudePrompt?: string) => {
    const message = selectedMessageRef.current;
    if (!text || !message || !activeChannelId) return;

    try {
      const persistRes = await fetch(
        `${SERVER_URL}/channels/${activeChannelId}/messages/${message.id}/prompts`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        },
      );
      if (!persistRes.ok) {
        console.error('Failed to persist plan response prompt');
        return;
      }

      const { message: updated } = (await persistRes.json()) as { message: ChannelMessage };
      upsertMessage(updated);
      if (selectedMessageIdRef.current === updated.id) void loadThreadEvents(updated);

      spawnedMessageIds.current.add(message.id);
      const result = await window.traceAPI.spawnClaude(message.id, claudePrompt ?? text);
      if (!result.success) {
        spawnedMessageIds.current.delete(message.id);
        console.error('Failed to spawn claude for plan response:', result.error);
      }
    } catch {
      console.error('Failed to send plan response');
    }
  }, [activeChannelId, selectedMessageRef, selectedMessageIdRef, upsertMessage, loadThreadEvents]);

  const mergeToMain = useCallback(async () => {
    const message = selectedMessageRef.current;
    if (!message || !activeChannelId) return;

    const prompt = '/merge-to-main';
    try {
      const persistRes = await fetch(
        `${SERVER_URL}/channels/${activeChannelId}/messages/${message.id}/prompts`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: prompt }),
        },
      );
      if (!persistRes.ok) {
        console.error('Failed to persist merge-to-main prompt');
        return;
      }

      const { message: updated } = (await persistRes.json()) as { message: ChannelMessage };
      upsertMessage(updated);
      if (selectedMessageIdRef.current === updated.id) void loadThreadEvents(updated);

      spawnedMessageIds.current.add(message.id);
      const result = await window.traceAPI.spawnClaude(message.id, prompt);
      if (result.success) {
        void updateMessageStatus(message.id, 'completed');
      } else {
        spawnedMessageIds.current.delete(message.id);
        console.error('Failed to spawn claude for merge-to-main:', result.error);
      }
    } catch {
      console.error('Failed to run merge-to-main');
    }
  }, [activeChannelId, selectedMessageRef, selectedMessageIdRef, upsertMessage, loadThreadEvents, updateMessageStatus]);

  // --- Channel Settings Modal ---
  const settingsChannel = useMemo(
    () => channels.find((c) => c.id === settingsChannelId) ?? null,
    [channels, settingsChannelId],
  );

  const handleOpenSettings = useCallback(
    (channelId: string) => {
      setSettingsChannelId(channelId);
      void fetchScripts(channelId);
    },
    [fetchScripts],
  );

  const handleSaveSettings = useCallback(
    async (cwd: string | null, draftScripts: DraftScript[]) => {
      if (!settingsChannelId) return;

      await updateChannelCwd(settingsChannelId, cwd);

      // Diff existing scripts vs draft to determine create/update/delete
      const existingIds = new Set(scripts.map((s) => s.id));
      const draftIds = new Set(draftScripts.filter((d) => d.id).map((d) => d.id!));

      // Delete scripts that were removed
      for (const s of scripts) {
        if (!draftIds.has(s.id)) {
          await deleteScript(settingsChannelId, s.id);
        }
      }

      // Create or update scripts
      for (let i = 0; i < draftScripts.length; i++) {
        const d = draftScripts[i];
        if (!d.name.trim() && !d.command.trim()) continue;
        if (d.id && existingIds.has(d.id)) {
          await updateScript(settingsChannelId, d.id, { name: d.name, command: d.command, sortOrder: i });
        } else {
          await addScript(settingsChannelId, d.name, d.command);
        }
      }

      // Refresh channel list to pick up cwd change
      void refreshChannels();
    },
    [settingsChannelId, scripts, updateChannelCwd, deleteScript, updateScript, addScript, refreshChannels],
  );

  // --- Startup Scripts ---
  const handleRunStartupScripts = useCallback(
    async (channelId: string) => {
      const channel = channels.find((c) => c.id === channelId);
      if (!channel?.cwd) return;

      // Fetch latest scripts for this channel
      const res = await fetch(`${SERVER_URL}/channels/${channelId}/startup-scripts`);
      if (!res.ok) return;
      const { scripts: channelScripts } = (await res.json()) as { scripts: StartupScript[] };
      if (channelScripts.length === 0) return;

      runAllScripts(channelId, channel.cwd, channelScripts);
    },
    [channels, runAllScripts],
  );

  // --- Per-message startup scripts ---
  const handleRunMessageScripts = useCallback(
    async () => {
      if (!selectedMessageId || !activeChannelId) return;

      // Check worktree exists to get the path
      const wtResult = await window.traceAPI.checkWorktreeExists(selectedMessageId);
      if (!wtResult.success || !wtResult.exists || !wtResult.worktreePath) return;
      const worktreeDir = wtResult.worktreePath;

      // Fetch channel's startup scripts
      const res = await fetch(`${SERVER_URL}/channels/${activeChannelId}/startup-scripts`);
      if (!res.ok) return;
      const { scripts: channelScripts } = (await res.json()) as { scripts: StartupScript[] };
      if (channelScripts.length === 0) return;

      // Allocate ports — one per script
      const portResult = await window.traceAPI.allocatePorts(selectedMessageId, channelScripts.length);
      if (!portResult.success || !portResult.ports) return;
      const ports = portResult.ports;

      // Build per-script env maps
      const envMaps: Record<string, string>[] = channelScripts.map((_, i) => {
        const env: Record<string, string> = {
          PORT: String(ports[i]),
          TRACE_BASE_PORT: String(ports[0]),
        };
        for (let j = 0; j < ports.length; j++) {
          env[`TRACE_PORT_${j}`] = String(ports[j]);
        }
        return env;
      });

      runAllScripts(selectedMessageId, worktreeDir, channelScripts, envMaps);
    },
    [selectedMessageId, activeChannelId, runAllScripts],
  );

  // Whether the play button should appear in the thread header
  const scriptsAvailable = Boolean(activeChannelId && hasWorktree === true);

  const terminalId = `fullscreen-${selectedMessageId ?? 'none'}`;

  // Find the cwd for the active channel (for startup terminals)
  const activeChannelCwd = activeChannel?.cwd ?? '';

  return (
    <div className="flex h-screen overflow-hidden bg-[#1a1b26] text-[#c0caf5]">
      <ChannelPanel
        channels={channels}
        activeChannelId={activeChannelId}
        channelWidth={isFullscreen ? 0 : channelWidth}
        dragging={dragging}
        onSwitchChannel={handleSwitchChannel}
        onOpenSettings={handleOpenSettings}
        onRunStartupScripts={(id) => void handleRunStartupScripts(id)}
        onStartDrag={() => startDragging('left')}
      />

      <div
        className="flex min-h-0 min-w-0 flex-col panel-animate"
        style={{
          flex: isFullscreen ? '0 0 0px' : '1 1 0%',
          overflow: 'hidden',
        }}
      >
        <div className={startupTerminalsVisible && startupTerminalList.length > 0 && !isFullscreen ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : 'flex min-h-0 flex-1 flex-col'}>
          <MessagePanel
            feedTitle={feedTitle}
            messages={messages}
            selectedMessageId={selectedMessageId}
            messageInput={messageInput}
            attentionMessageIds={attentionMessageIds}
            onMessageInputChange={setMessageInput}
            onSendMessage={() => void sendMessage()}
            onOpenThread={handleOpenThread}
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
              cwd={startupTerminalsCwd || activeChannelCwd}
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
        deletingWorktree={deletingWorktree}
        hasWorktree={hasWorktree}
        showJumpToLatest={showJumpToLatest}
        threadInput={threadInput}
        isClaudeRunning={isClaudeRunning}
        threadContentRef={threadContentRef}
        scriptsAvailable={scriptsAvailable}
        onRunScripts={() => void handleRunMessageScripts()}
        pendingRunMessageId={pendingRunMessageId}
        pendingRunPrompt={pendingRunPrompt}
        onPendingPromptChange={setPendingRunPrompt}
        onRun={(planMode: boolean) => void runMessage(planMode)}
        onStopClaude={() => void stopClaude()}
        onThreadScroll={onThreadScroll}
        onToggleReadGroup={toggleReadGroup}
        onScrollToLatest={() => scrollThreadToBottom('smooth')}
        onClose={handleCloseThread}
        onDeleteWorktree={() => {
          killAllTerminals();
          if (selectedMessageId) void window.traceAPI.releasePorts(selectedMessageId);
          void deleteWorktree((messageId) => void updateMessageStatus(messageId, 'completed'));
        }}
        onMergeToMain={() => void mergeToMain()}
        onThreadInputChange={setThreadInput}
        onSendThreadMessage={() => void sendThreadMessage()}
        onPlanResponse={(text, claudePrompt) => void sendPlanResponse(text, claudePrompt)}
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
          {isFullscreen && <WorktreeChanges messageId={selectedMessageId} />}
        </div>
        <div
          className="overflow-hidden"
          style={{ height: isFullscreen ? '40%' : '0', minHeight: isFullscreen ? '150px' : '0' }}
        >
          {isFullscreen && startupTerminalList.length > 0 ? (
            <TerminalTabs
              terminals={startupTerminalList}
              activeTabId={activeTabId}
              cwd={activeChannelCwd}
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
          scripts={scripts}
          onClose={() => setSettingsChannelId(null)}
          onSave={handleSaveSettings}
        />
      )}
    </div>
  );
}
