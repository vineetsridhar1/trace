import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChannelMessage } from './types';
import { SERVER_URL } from './types';
import { buildThreadNodes } from './utils';
import { useChannels } from './hooks/useChannels';
import { useMessages } from './hooks/useMessages';
import { useThread } from './hooks/useThread';
import { useThreadScroll } from './hooks/useThreadScroll';
import { usePanelResize } from './hooks/usePanelResize';
import { useSse } from './hooks/useSse';
import { ChannelPanel } from './components/ChannelPanel';
import { MessagePanel } from './components/MessagePanel';
import { ThreadPanel } from './components/ThreadPanel';
import { WorktreeChanges } from './components/WorktreeChanges';
import { Terminal } from './components/Terminal';

export default function App() {
  const { channels, activeChannelId, activeChannel, switchChannel } = useChannels();
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

  const [channelWidth, setChannelWidth] = useState(220);
  const [messageInput, setMessageInput] = useState('');
  const [threadInput, setThreadInput] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [worktreePath, setWorktreePath] = useState('');
  const [pendingRunMessageId, setPendingRunMessageId] = useState<string | null>(null);
  const [pendingRunPrompt, setPendingRunPrompt] = useState('');
  const savedWidthsRef = useRef({ channel: 220, thread: 0 });
  const spawnedMessageIds = useRef(new Set<string>());

  const { dragging, startDragging } = usePanelResize(setChannelWidth, setThreadWidth);

  const { sseConnected } = useSse({
    activeChannelId,
    upsertMessage,
    loadThreadEvents,
    reportClaudeActivity,
    selectedMessageIdRef,
    messagesRef,
    selectedMessageRef,
  });

  const feedTitle = activeChannel ? `# ${activeChannel.name}` : 'Activity Feed';
  const threadNodes = useMemo(() => buildThreadNodes(threadEvents), [threadEvents]);
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
      switchChannel(channelId);
      clearMessages();
      closeThreadPanel();
      setChannelWidth(220);
    },
    [switchChannel, clearMessages, closeThreadPanel],
  );

  const handleOpenThread = useCallback(
    (message: ChannelMessage) => {
      setChannelWidth(0);
      resetScroll();
      openThreadPanel(message);
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

    setPendingRunMessageId(null);
    setPendingRunPrompt('');

    spawnedMessageIds.current.add(pendingRunMessageId);
    const result = await window.traceAPI.spawnClaude(pendingRunMessageId, prompt);
    if (result.success) {
      setHasWorktree(true);
    } else {
      console.error('Failed to spawn claude:', result.error);
    }
  }, [pendingRunMessageId, pendingRunPrompt, setHasWorktree]);

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
      } else {
        console.error('Failed to spawn claude:', result.error);
      }
    } catch {
      console.error('Failed to send thread message');
    }
  }, [activeChannelId, threadInput, selectedMessageRef, selectedMessageIdRef, upsertMessage, loadThreadEvents, setHasWorktree]);

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
  }, [selectedMessageId, channelWidth, threadWidth]);

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
      if (!result.success) console.error('Failed to spawn claude for plan response:', result.error);
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
      if (!result.success) console.error('Failed to spawn claude for merge-to-main:', result.error);
    } catch {
      console.error('Failed to run merge-to-main');
    }
  }, [activeChannelId, selectedMessageRef, selectedMessageIdRef, upsertMessage, loadThreadEvents]);

  const terminalId = `fullscreen-${selectedMessageId ?? 'none'}`;

  return (
    <div className="flex h-screen overflow-hidden bg-[#1a1b26] text-[#c0caf5]">
      <ChannelPanel
        channels={channels}
        activeChannelId={activeChannelId}
        channelWidth={isFullscreen ? 0 : channelWidth}
        dragging={dragging}
        onSwitchChannel={handleSwitchChannel}
        onStartDrag={() => startDragging('left')}
      />

      <div
        className="flex min-h-0 min-w-0 flex-col panel-animate"
        style={{
          flex: isFullscreen ? '0 0 0px' : '1 1 0%',
          overflow: 'hidden',
        }}
      >
        <MessagePanel
          feedTitle={feedTitle}
          messages={messages}
          selectedMessageId={selectedMessageId}
          messageInput={messageInput}
          onMessageInputChange={setMessageInput}
          onSendMessage={() => void sendMessage()}
          onOpenThread={handleOpenThread}
        />
      </div>

      <ThreadPanel
        threadWidth={isFullscreen ? 9999 : threadWidth}
        dragging={dragging}
        threadStatus={threadStatus}
        activeThreadId={activeThreadId}
        threadNodes={threadNodes}
        expandedReadGroupIds={expandedReadGroupIds}
        selectedMessageId={selectedMessageId}
        deletingWorktree={deletingWorktree}
        hasWorktree={hasWorktree}
        showJumpToLatest={showJumpToLatest}
        threadInput={threadInput}
        isClaudeRunning={isClaudeRunning}
        threadContentRef={threadContentRef}
        pendingRunMessageId={pendingRunMessageId}
        onRun={(planMode: boolean) => void runMessage(planMode)}
        onThreadScroll={onThreadScroll}
        onToggleReadGroup={toggleReadGroup}
        onScrollToLatest={() => scrollThreadToBottom('smooth')}
        onClose={handleCloseThread}
        onDeleteWorktree={() => void deleteWorktree()}
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
          {isFullscreen && <Terminal terminalId={terminalId} cwd={worktreePath} />}
        </div>
      </div>
    </div>
  );
}
