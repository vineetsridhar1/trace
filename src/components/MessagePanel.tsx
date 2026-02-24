import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChannelMessage, KanbanColumn as KanbanColumnType, KanbanTicket, MiddlePanelView, TicketStatus } from '../types';
import { avatarInitial, formatTime, stripTraceInternal } from '../utils';
import { useSlashCommands } from '../hooks/useSlashCommands';
import { useAutoResizeTextarea } from '../hooks/useAutoResizeTextarea';
import { useClaudeActions } from '../context/ClaudeActionsContext';
import { useImageAttachments } from '../hooks/useImageAttachments';
import { SlashCommandMenu } from './SlashCommandMenu';
import { ImageThumbnails } from './ImageThumbnails';
import { KanbanBoard } from './KanbanBoard';

interface MessagePanelProps {
  feedTitle: string;
  messages: ChannelMessage[];
  selectedMessageId: string | null;
  attentionMessageIds: Set<string>;
  onOpenThread: (message: ChannelMessage) => void;
  middlePanelView: MiddlePanelView;
  onSetView: (view: MiddlePanelView) => void;
  kanbanColumns: KanbanColumnType[];
  kanbanLoading: boolean;
  onMoveTicket: (ticketId: string, columnId: string, sortOrder: number) => void;
}

export function MessagePanel({
  feedTitle,
  messages,
  selectedMessageId,
  attentionMessageIds,
  onOpenThread,
  middlePanelView,
  onSetView,
  kanbanColumns,
  kanbanLoading,
  onMoveTicket,
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

  // Sort: completed items first (oldest→newest), then active items (oldest→newest)
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
        <h2 id="feed-title" className="text-sm font-semibold text-violet-300">
          {feedTitle}
        </h2>
        <div className="flex rounded-lg bg-[#1f2335] p-0.5">
          <button
            type="button"
            onClick={() => onSetView('feed')}
            className={`cursor-pointer rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              middlePanelView === 'feed'
                ? 'bg-violet-500/20 text-violet-300'
                : 'text-[#565f89] hover:text-[#a9b1d6]'
            }`}
          >
            Feed
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
        </div>
      </div>

      {middlePanelView === 'feed' ? (
        <>
          <div
            id="feed-list"
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
      ) : (
        <>
          <KanbanBoard
            columns={kanbanColumns}
            loading={kanbanLoading}
            onClickTicket={handleBoardClickTicket}
            onMoveTicket={onMoveTicket}
          />
          <MessageInput />
        </>
      )}
    </div>
  );
}

function MessageInput() {
  const { sendMessage } = useClaudeActions();
  const [messageInput, setMessageInput] = useState('');
  const textareaRef = useAutoResizeTextarea(messageInput);
  const slashCommands = useSlashCommands(messageInput, setMessageInput);
  const imageAttachments = useImageAttachments();

  const handleSendMessage = useCallback(async () => {
    const text = messageInput.trim();
    if (!text) return;
    const attachmentIds = imageAttachments.getAttachmentIds();
    const filePaths = imageAttachments.getFilePaths();
    const sent = await sendMessage(
      text,
      attachmentIds.length > 0 ? attachmentIds : undefined,
      filePaths.length > 0 ? filePaths : undefined,
    );
    if (sent) {
      setMessageInput('');
      imageAttachments.clearAttachments();
    }
  }, [messageInput, sendMessage, imageAttachments]);

  return (
    <div className="border-t border-[#292e42] px-3 py-3">
      <ImageThumbnails images={imageAttachments.attachments} onRemove={imageAttachments.removeAttachment} />
      {imageAttachments.uploading && (
        <div className="flex items-center gap-2 px-1 pb-2">
          <svg className="h-3.5 w-3.5 animate-spin text-violet-400" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
          </svg>
          <span className="text-xs text-[#565f89]">Uploading...</span>
        </div>
      )}
      <div className="flex items-end gap-2">
        <div className="relative flex-1">
          <SlashCommandMenu
            isOpen={slashCommands.isOpen}
            commands={slashCommands.filteredCommands}
            selectedIndex={slashCommands.selectedIndex}
            onSelect={slashCommands.selectCommand}
          />
          <textarea
            id="message-input"
            ref={textareaRef}
            rows={1}
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onPaste={(e) => void imageAttachments.handlePaste(e)}
            onKeyDown={(e) => {
              if (slashCommands.handleKeyDown(e)) return;
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSendMessage();
              }
            }}
            placeholder="Send a message..."
            className="w-full resize-none rounded-lg border border-[#292e42] bg-[#1f2335] px-3 py-2 text-sm text-[#c0caf5] outline-none transition-colors placeholder:text-[#565f89] focus:border-violet-500"
          />
        </div>
        <button
          id="message-send"
          type="button"
          onClick={() => void handleSendMessage()}
          className="cursor-pointer rounded-lg bg-violet-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-700"
        >
          Send
        </button>
      </div>
    </div>
  );
}

function MessagePreview({ text }: { text: string }) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [needsClamp, setNeedsClamp] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [collapsedH, setCollapsedH] = useState(0);
  const [fullH, setFullH] = useState(0);

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const lh = parseFloat(getComputedStyle(el).lineHeight) || 20;
    const clampH = Math.ceil(lh * 3);
    const scrollH = el.scrollHeight;
    if (scrollH > clampH + 4) {
      setNeedsClamp(true);
      setCollapsedH(clampH);
      setFullH(scrollH);
    } else {
      setNeedsClamp(false);
    }
  }, [text]);

  return (
    <div className="mt-1">
      <div
        style={{
          maxHeight: !needsClamp ? undefined : expanded ? `${fullH}px` : `${collapsedH}px`,
          overflow: 'hidden',
          transition: 'max-height 0.3s ease',
        }}
      >
        <div ref={innerRef} className="break-words whitespace-pre-wrap text-sm text-[#a9b1d6]">
          {text}
        </div>
      </div>
      {needsClamp && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
          className="mt-1 cursor-pointer text-xs font-medium text-violet-400 hover:text-violet-300"
        >
          {expanded ? 'See less' : 'See more'}
        </button>
      )}
    </div>
  );
}

const STATUS_CONFIG: Record<TicketStatus, { label: string; color: string; bgColor: string; avatarBg: string; avatarText: string }> = {
  pending: { label: 'Pending', color: 'text-yellow-400', bgColor: 'bg-yellow-400/10', avatarBg: 'bg-yellow-500/20', avatarText: 'text-yellow-400' },
  creation: { label: 'Creating', color: 'text-orange-400', bgColor: 'bg-orange-400/10', avatarBg: 'bg-orange-500/20', avatarText: 'text-orange-400' },
  in_progress: { label: 'In Progress', color: 'text-blue-400', bgColor: 'bg-blue-400/10', avatarBg: 'bg-blue-500', avatarText: 'text-white' },
  completed: { label: 'Completed', color: 'text-green-400', bgColor: 'bg-green-400/10', avatarBg: 'bg-green-500/20', avatarText: 'text-green-400' },
};

function StatusBadge({ status }: { status: TicketStatus }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  return (
    <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${config.color} ${config.bgColor}`}>
      {config.label}
    </span>
  );
}

interface MessageItemProps {
  message: ChannelMessage;
  ticket: KanbanTicket | null;
  isSelected: boolean;
  needsAttention?: boolean;
  onOpenThread: (message: ChannelMessage) => void;
  dimmed?: boolean;
}

const MessageItem = memo(function MessageItem({
  message,
  ticket,
  isSelected,
  needsAttention,
  onOpenThread,
  dimmed,
}: MessageItemProps) {
  const rawPreview = message.preview || message.session.cwd || message.sessionId;
  const preview = stripTraceInternal(rawPreview);
  const threadCount = message._count.threads;
  const status = (message.status ?? 'pending') as TicketStatus;
  const avatarConfig = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;

  return (
    <button
      type="button"
      className={`message-item flex cursor-pointer items-start gap-3 border-l-2 border-transparent px-3 py-3 text-left transition-colors ${
        isSelected ? 'selected' : ''
      } ${!isSelected && needsAttention ? 'needs-attention' : ''} ${dimmed ? 'opacity-50' : ''}`}
      onClick={() => onOpenThread(message)}
    >
      <div
        className={`mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${avatarConfig.avatarBg} ${avatarConfig.avatarText}`}
      >
        {avatarInitial(message.sessionId)}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <StatusBadge status={status} />
          <span className="rounded bg-[#1f2335] px-1.5 py-0.5 font-mono text-xs text-[#565f89]">
            {message.sessionId === 'user-manual-input' ? 'You' : message.sessionId.slice(0, 8)}
          </span>
          {message.branch && (
            <span className="rounded bg-[#1f2335] px-1.5 py-0.5 font-mono text-xs text-blue-400">
              {message.branch.replace(/^trace\//, '')}
            </span>
          )}
          <span className="ml-auto text-xs text-[#565f89]">{formatTime(message.createdAt)}</span>
        </div>
        {ticket ? (
          <>
            <p className="mt-1 text-sm font-semibold text-[#c0caf5]">{ticket.title}</p>
            {ticket.description && (
              <p className="mt-0.5 line-clamp-2 text-sm text-[#a9b1d6]">{ticket.description}</p>
            )}
          </>
        ) : (
          <>
            <MessagePreview text={preview} />
            {message.summary && (
              <p className="mt-0.5 line-clamp-2 text-xs text-[#565f89]">{message.summary}</p>
            )}
          </>
        )}
        {threadCount > 1 && (
          <div className="mt-1.5 text-xs text-violet-300 hover:underline">
            {threadCount} threads
          </div>
        )}
      </div>
    </button>
  );
}, areMessageItemPropsEqual);

function areMessageItemPropsEqual(prev: MessageItemProps, next: MessageItemProps) {
  return (
    prev.message === next.message &&
    prev.ticket === next.ticket &&
    prev.isSelected === next.isSelected &&
    prev.needsAttention === next.needsAttention &&
    prev.dimmed === next.dimmed &&
    prev.onOpenThread === next.onOpenThread
  );
}
