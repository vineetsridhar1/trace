import { useCallback, useEffect, useMemo, useRef } from 'react';
import { FiSettings } from 'react-icons/fi';
import { Tooltip } from './Tooltip';
import type { ChannelMessage, KanbanColumn as KanbanColumnType, KanbanTicket, MiddlePanelView } from '../types';
import { KanbanBoard } from './KanbanBoard';
import { MessageInput } from './MessageInput';
import { MessageItem } from './MessageItem';
import { ChatEmptyState } from './ChatEmptyState';

interface MessagePanelProps {
  panelTitle: string;
  channelCreatedAt: string | null;
  messages: ChannelMessage[];
  selectedMessageId: string | null;
  attentionMessageIds: Set<string>;
  onOpenThread: (message: ChannelMessage) => void;
  middlePanelView: MiddlePanelView;
  onSetView: (view: MiddlePanelView) => void;
  kanbanColumns: KanbanColumnType[];
  kanbanLoading: boolean;
  onMoveTicket: (ticketId: string, columnId: string, sortOrder: number) => void;
  onOpenSettings: () => void;
}

export function MessagePanel({
  panelTitle,
  channelCreatedAt,
  messages,
  selectedMessageId,
  attentionMessageIds,
  onOpenThread,
  middlePanelView,
  onSetView,
  kanbanColumns,
  kanbanLoading,
  onMoveTicket,
  onOpenSettings,
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
    const completed: ChannelMessage[] = [];
    const active: ChannelMessage[] = [];

    for (const msg of messages) {
      if (msg.status === 'completed') {
        completed.push(msg);
      } else {
        active.push(msg);
      }
    }

    return [...completed, ...active];
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
    <div id="messages-panel" className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#1a1b26]">
      <div className="flex items-center justify-between border-b border-[#292e42] px-4 py-3">
        <h2 id="panel-title" className="text-sm font-semibold text-violet-300">
          {panelTitle}
        </h2>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg bg-[#1f2335] p-0.5">
            <button
              type="button"
              onClick={() => onSetView('chat')}
              className={`cursor-pointer rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                middlePanelView === 'chat'
                  ? 'bg-violet-500/20 text-violet-300'
                  : 'text-[#565f89] hover:text-[#a9b1d6]'
              }`}
            >
              Chat
            </button>
            <button
              type="button"
              onClick={() => onSetView('board')}
              className={`cursor-pointer rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                middlePanelView === 'board'
                  ? 'bg-violet-500/20 text-violet-300'
                  : 'text-[#565f89] hover:text-[#a9b1d6]'
              }`}
            >
              Board
            </button>
            <button
              type="button"
              onClick={() => onSetView('workspaces')}
              className={`cursor-pointer rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                middlePanelView === 'workspaces'
                  ? 'bg-violet-500/20 text-violet-300'
                  : 'text-[#565f89] hover:text-[#a9b1d6]'
              }`}
            >
              Workspaces
            </button>
          </div>
          <Tooltip text="Channel settings" position="bottom">
            <button
              type="button"
              onClick={onOpenSettings}
              className="cursor-pointer rounded p-1 text-[#565f89] hover:bg-[#292e42] hover:text-[#c0caf5] transition-colors"
            >
              <FiSettings className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </Tooltip>
        </div>
      </div>

      {middlePanelView === 'chat' ? (
        <ChatEmptyState
          channelName={panelTitle.replace(/^#\s*/, '')}
          channelCreatedAt={channelCreatedAt}
        />
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
        <>
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
                dimmed={message.status === 'completed'}
              />
            ))}
          </div>

          <MessageInput />
        </>
      )}
    </div>
  );
}
