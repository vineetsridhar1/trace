import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChannelMessage, TicketStatus } from '../types';
import { avatarInitial, formatTime } from '../utils';

function useAutoResize(value: string, maxHeight = 300) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!value) {
      el.style.height = '';
      return;
    }
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, [value, maxHeight]);
  return ref;
}

interface MessagePanelProps {
  feedTitle: string;
  messages: ChannelMessage[];
  selectedMessageId: string | null;
  messageInput: string;
  attentionMessageIds: Set<string>;
  onMessageInputChange: (value: string) => void;
  onSendMessage: () => void;
  onOpenThread: (message: ChannelMessage) => void;
}

export function MessagePanel({
  feedTitle,
  messages,
  selectedMessageId,
  messageInput,
  attentionMessageIds,
  onMessageInputChange,
  onSendMessage,
  onOpenThread,
}: MessagePanelProps) {
  const feedListRef = useRef<HTMLDivElement | null>(null);
  const [completedExpanded, setCompletedExpanded] = useState(false);

  const { activeMessages, completedMessages } = useMemo(() => {
    const active: ChannelMessage[] = [];
    const completed: ChannelMessage[] = [];

    for (const msg of messages) {
      if (msg.status === 'completed') {
        completed.push(msg);
      } else {
        active.push(msg);
      }
    }

    return { activeMessages: active, completedMessages: completed };
  }, [messages]);

  const scrollFeedToBottom = useCallback(() => {
    const el = feedListRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    scrollFeedToBottom();
  }, [messages, scrollFeedToBottom]);

  return (
    <div id="messages-panel" className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#1a1b26]">
      <div className="border-b border-[#292e42] px-4 py-3">
        <h2 id="feed-title" className="text-sm font-semibold text-violet-300">
          {feedTitle}
        </h2>
      </div>

      <div
        id="feed-list"
        ref={feedListRef}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 py-2"
      >
        <div className="flex-1" />
        {activeMessages.map((message) => (
          <MessageItem
            key={message.id}
            message={message}
            isSelected={message.id === selectedMessageId}
            needsAttention={attentionMessageIds.has(message.id)}
            onOpenThread={onOpenThread}
          />
        ))}

        {completedMessages.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setCompletedExpanded((prev) => !prev)}
              className="mx-1 mt-3 mb-1 flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs text-[#565f89] transition-colors hover:bg-[#1f2335] hover:text-[#a9b1d6]"
            >
              <span
                className="inline-block transition-transform"
                style={{ transform: completedExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
              >
                ▶
              </span>
              <span>Completed ({completedMessages.length})</span>
            </button>
            {completedExpanded &&
              completedMessages.map((message) => (
                <MessageItem
                  key={message.id}
                  message={message}
                  isSelected={message.id === selectedMessageId}
                  needsAttention={attentionMessageIds.has(message.id)}
                  onOpenThread={onOpenThread}
                  dimmed
                />
              ))}
          </>
        )}
      </div>

      <MessageInput
        messageInput={messageInput}
        onMessageInputChange={onMessageInputChange}
        onSendMessage={onSendMessage}
      />
    </div>
  );
}

function MessageInput({
  messageInput,
  onMessageInputChange,
  onSendMessage,
}: {
  messageInput: string;
  onMessageInputChange: (value: string) => void;
  onSendMessage: () => void;
}) {
  const textareaRef = useAutoResize(messageInput);

  return (
    <div className="border-t border-[#292e42] px-3 py-3">
      <div className="flex items-end gap-2">
        <textarea
          id="message-input"
          ref={textareaRef}
          rows={1}
          value={messageInput}
          onChange={(e) => onMessageInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onSendMessage();
            }
          }}
          placeholder="Send a message..."
          className="flex-1 resize-none rounded-lg border border-[#292e42] bg-[#1f2335] px-3 py-2 text-sm text-[#c0caf5] outline-none transition-colors placeholder:text-[#565f89] focus:border-violet-500"
        />
        <button
          id="message-send"
          type="button"
          onClick={onSendMessage}
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

function MessageItem({
  message,
  isSelected,
  needsAttention,
  onOpenThread,
  dimmed,
}: {
  message: ChannelMessage;
  isSelected: boolean;
  needsAttention?: boolean;
  onOpenThread: (message: ChannelMessage) => void;
  dimmed?: boolean;
}) {
  const preview = message.preview || message.session.cwd || message.sessionId;
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
        <MessagePreview text={preview} />
        {message.summary && (
          <p className="mt-0.5 line-clamp-2 text-xs text-[#565f89]">{message.summary}</p>
        )}
        {threadCount > 1 && (
          <div className="mt-1.5 text-xs text-violet-300 hover:underline">
            {threadCount} threads
          </div>
        )}
      </div>
    </button>
  );
}
