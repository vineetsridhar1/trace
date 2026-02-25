import { memo, useRef, useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChannelMessage, KanbanTicket, TicketStatus } from '../types';
import { avatarInitial, formatTime, stripTraceInternal } from '../utils';

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

interface MessageItemProps {
  message: ChannelMessage;
  ticket: KanbanTicket | null;
  isSelected: boolean;
  needsAttention?: boolean;
  onOpenThread: (message: ChannelMessage) => void;
  dimmed?: boolean;
}

export const MessageItem = memo(function MessageItem({
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
              <div className="markdown-body mt-0.5 line-clamp-2 text-sm text-[#a9b1d6]">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{ticket.description}</ReactMarkdown>
              </div>
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
