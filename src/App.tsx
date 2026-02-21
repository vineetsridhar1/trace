import { useCallback, useEffect, useMemo, useState } from 'react';
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

      const result = await window.traceAPI.spawnClaude(message.id, text);
      if (!result.success) console.error('Failed to spawn claude:', result.error);
    } catch {
      console.error('Failed to send message');
    }
  }, [messageInput, activeChannelId, upsertMessage, handleOpenThread]);

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

      const result = await window.traceAPI.spawnClaude(message.id, text);
      if (!result.success) console.error('Failed to spawn claude:', result.error);
    } catch {
      console.error('Failed to send thread message');
    }
  }, [activeChannelId, threadInput, selectedMessageRef, selectedMessageIdRef, upsertMessage, loadThreadEvents]);

  const handleCloseThread = useCallback(() => {
    closeThreadPanel();
    setChannelWidth(220);
  }, [closeThreadPanel]);

  return (
    <div className="flex h-screen overflow-hidden bg-[#1a1b26] text-[#c0caf5]">
      <ChannelPanel
        channels={channels}
        activeChannelId={activeChannelId}
        channelWidth={channelWidth}
        dragging={dragging}
        onSwitchChannel={handleSwitchChannel}
        onStartDrag={() => startDragging('left')}
      />

      <MessagePanel
        feedTitle={feedTitle}
        messages={messages}
        selectedMessageId={selectedMessageId}
        messageInput={messageInput}
        onMessageInputChange={setMessageInput}
        onSendMessage={() => void sendMessage()}
        onOpenThread={handleOpenThread}
      />

      <ThreadPanel
        threadWidth={threadWidth}
        dragging={dragging}
        threadStatus={threadStatus}
        activeThreadId={activeThreadId}
        threadNodes={threadNodes}
        expandedReadGroupIds={expandedReadGroupIds}
        selectedMessageId={selectedMessageId}
        deletingWorktree={deletingWorktree}
        showJumpToLatest={showJumpToLatest}
        threadInput={threadInput}
        threadContentRef={threadContentRef}
        onThreadScroll={onThreadScroll}
        onToggleReadGroup={toggleReadGroup}
        onScrollToLatest={() => scrollThreadToBottom('smooth')}
        onClose={handleCloseThread}
        onDeleteWorktree={() => void deleteWorktree()}
        onThreadInputChange={setThreadInput}
        onSendThreadMessage={() => void sendThreadMessage()}
        onStartDrag={() => startDragging('right')}
      />
    </div>
  );
}
