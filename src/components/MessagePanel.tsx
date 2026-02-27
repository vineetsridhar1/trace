import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChannelMessage, KanbanColumn as KanbanColumnType, KanbanTicket, MiddlePanelView } from '../types';
import { KanbanBoard } from './KanbanBoard';
import { MessageInput } from './MessageInput';
import { MessageItem } from './MessageItem';
import { ChatEmptyState } from './ChatEmptyState';
import { ThreadPanel } from './ThreadPanel';

interface MessagePanelProps {
  panelTitle: string;
  channelCreatedAt: string | null;
  messages: ChannelMessage[];
  selectedMessageId: string | null;
  attentionMessageIds: Set<string>;
  onOpenThread: (message: ChannelMessage) => void;
  middlePanelView: MiddlePanelView;
  kanbanColumns: KanbanColumnType[];
  kanbanLoading: boolean;
  onMoveTicket: (ticketId: string, columnId: string, sortOrder: number) => void;
  onDeleteMessage?: (messageId: string) => void;
  isFullscreen?: boolean;
}

export function MessagePanel({
  panelTitle,
  channelCreatedAt,
  messages,
  selectedMessageId,
  attentionMessageIds,
  onOpenThread,
  middlePanelView,
  kanbanColumns,
  kanbanLoading,
  onDeleteMessage,
  onMoveTicket,
  isFullscreen,
}: MessagePanelProps) {
  const feedListRef = useRef<HTMLDivElement | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);
  const [feedWidth, setFeedWidth] = useState(Infinity);

  const feedRefCallback = useCallback((el: HTMLDivElement | null) => {
    feedListRef.current = el;
    if (roRef.current) {
      roRef.current.disconnect();
      roRef.current = null;
    }
    if (el) {
      roRef.current = new ResizeObserver(([entry]) => {
        setFeedWidth(entry.contentRect.width);
      });
      roRef.current.observe(el);
    }
  }, []);

  const compact = feedWidth < 300;

  const ticketByMessageId = useMemo(() => {
    const map = new Map<string, KanbanTicket>();
    for (const col of kanbanColumns) {
      for (const ticket of col.tickets) {
        map.set(ticket.messageId, ticket);
      }
    }
    return map;
  }, [kanbanColumns]);

  const sortedMessages = useMemo(() => {
    const merged: ChannelMessage[] = [];
    const active: ChannelMessage[] = [];

    for (const msg of messages) {
      if (msg.status === 'merged') {
        merged.push(msg);
      } else {
        active.push(msg);
      }
    }

    return [...merged, ...active];
  }, [messages]);

  const nearBottomRef = useRef(true);
  const prevMessageCountRef = useRef(0);

  useEffect(() => {
    const prevCount = prevMessageCountRef.current;
    const currCount = messages.length;
    prevMessageCountRef.current = currCount;

    const el = feedListRef.current;
    if (!el) return;

    // Always scroll on first load (0 → N); otherwise only if near bottom
    if (prevCount === 0 || nearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const handleFeedScroll = useCallback(() => {
    const el = feedListRef.current;
    if (!el) return;
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
  }, []);

  const handleBoardClickTicket = useCallback(
    (messageId: string) => {
      const message = messages.find((m) => m.id === messageId);
      if (message) onOpenThread(message);
    },
    [messages, onOpenThread],
  );

  return (
    <div id="messages-panel" className="flex min-h-0 flex-1 flex-col bg-[#1a1b26]" style={{ minWidth: 200 }}>
      {middlePanelView === 'chat' ? (
        sortedMessages.length === 0 ? (
          <ChatEmptyState
            channelName={panelTitle.replace(/^#\s*/, '')}
            channelCreatedAt={channelCreatedAt}
          />
        ) : (
          <>
            <div
              ref={feedRefCallback}
              onScroll={handleFeedScroll}
              className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 py-2"
            >
              <div className="flex-1" style={{ overflowAnchor: 'none' }} />
              {sortedMessages.map((message) => (
                <MessageItem
                  key={message.id}
                  message={message}
                  ticket={ticketByMessageId.get(message.id) ?? null}
                  isSelected={message.id === selectedMessageId}
                  needsAttention={attentionMessageIds.has(message.id)}
                  onOpenThread={onOpenThread}
                  onDeleteMessage={onDeleteMessage}
                  dimmed={message.status === 'merged'}
                  compact={compact}
                />
              ))}
            </div>
            <MessageInput />
          </>
        )
      ) : middlePanelView === 'board' ? (
        <>
          <KanbanBoard
            columns={kanbanColumns}
            loading={kanbanLoading}
            onClickTicket={handleBoardClickTicket}
            onMoveTicket={onMoveTicket}
          />
          <MessageInput />
        </>
      ) : (
        <div className="flex min-h-0 flex-1">
          {!(isFullscreen && selectedMessageId) && (
            <div className="flex min-h-0 flex-1 flex-col" style={{ minWidth: 200 }}>
              <div
                id="workspaces-list"
                ref={feedRefCallback}
                onScroll={handleFeedScroll}
                className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 py-2"
              >
                <div className="flex-1" style={{ overflowAnchor: 'none' }} />
                {sortedMessages.map((message) => (
                  <MessageItem
                    key={message.id}
                    message={message}
                    ticket={ticketByMessageId.get(message.id) ?? null}
                    isSelected={message.id === selectedMessageId}
                    needsAttention={attentionMessageIds.has(message.id)}
                    onOpenThread={onOpenThread}
                    dimmed={message.status === 'merged'}
                    compact={compact}
                  />
                ))}
              </div>
              <MessageInput />
            </div>
          )}
          {selectedMessageId && <ThreadPanel />}
        </div>
      )}
    </div>
  );
}
