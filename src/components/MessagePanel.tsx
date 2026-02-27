import { useCallback, useEffect, useMemo, useRef } from 'react';
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

  const scrollFeedToBottom = useCallback(() => {
    const el = feedListRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    scrollFeedToBottom();
  }, [messages, scrollFeedToBottom]);

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
              ref={feedListRef}
              className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 py-2"
            >
              <div className="flex-1" />
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
                ref={feedListRef}
                className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 py-2"
              >
                <div className="flex-1" />
                {sortedMessages.map((message) => (
                  <MessageItem
                    key={message.id}
                    message={message}
                    ticket={ticketByMessageId.get(message.id) ?? null}
                    isSelected={message.id === selectedMessageId}
                    needsAttention={attentionMessageIds.has(message.id)}
                    onOpenThread={onOpenThread}
                    dimmed={message.status === 'merged'}
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
