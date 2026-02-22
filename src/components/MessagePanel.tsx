import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChannelMessage } from '../types';
import { avatarInitial, formatTime } from '../utils';

function useWorktreeStatus(messages: ChannelMessage[]) {
  // Map of messageId -> boolean (true = worktree exists)
  const [statusMap, setStatusMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    const ids = messages.map((m) => m.id);

    Promise.all(
      ids.map(async (id) => {
        const result = await window.traceAPI.checkWorktreeExists(id);
        return [id, result.exists ?? false] as const;
      }),
    ).then((results) => {
      if (cancelled) return;
      const next: Record<string, boolean> = {};
      for (const [id, exists] of results) next[id] = exists;
      setStatusMap(next);
    });

    return () => {
      cancelled = true;
    };
  }, [messages]);

  return statusMap;
}

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
  onMessageInputChange: (value: string) => void;
  onSendMessage: () => void;
  onOpenThread: (message: ChannelMessage) => void;
}

export function MessagePanel({
  feedTitle,
  messages,
  selectedMessageId,
  messageInput,
  onMessageInputChange,
  onSendMessage,
  onOpenThread,
}: MessagePanelProps) {
  const feedListRef = useRef<HTMLDivElement | null>(null);
  const [deletedExpanded, setDeletedExpanded] = useState(false);
  const worktreeStatus = useWorktreeStatus(messages);

  const { activeMessages, deletedMessages } = useMemo(() => {
    const active: ChannelMessage[] = [];
    const deleted: ChannelMessage[] = [];

    for (const msg of messages) {
      // If we haven't checked yet, treat as active
      if (worktreeStatus[msg.id] === false) {
        deleted.push(msg);
      } else {
        active.push(msg);
      }
    }

    return { activeMessages: active, deletedMessages: deleted };
  }, [messages, worktreeStatus]);

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
            onOpenThread={onOpenThread}
          />
        ))}

        {deletedMessages.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setDeletedExpanded((prev) => !prev)}
              className="mx-1 mt-3 mb-1 flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs text-[#565f89] transition-colors hover:bg-[#1f2335] hover:text-[#a9b1d6]"
            >
              <span
                className="inline-block transition-transform"
                style={{ transform: deletedExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
              >
                ▶
              </span>
              <span>Deleted worktrees ({deletedMessages.length})</span>
            </button>
            {deletedExpanded &&
              deletedMessages.map((message) => (
                <MessageItem
                  key={message.id}
                  message={message}
                  isSelected={message.id === selectedMessageId}
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

function MessageItem({
  message,
  isSelected,
  onOpenThread,
  dimmed,
}: {
  message: ChannelMessage;
  isSelected: boolean;
  onOpenThread: (message: ChannelMessage) => void;
  dimmed?: boolean;
}) {
  const active = !dimmed && message.session.status !== 'stopped';
  const preview = message.preview || message.session.cwd || message.sessionId;
  const threadCount = message._count.threads;

  return (
    <button
      type="button"
      className={`message-item flex cursor-pointer items-start gap-3 border-l-2 border-transparent px-3 py-3 text-left transition-colors ${
        isSelected ? 'selected' : ''
      } ${dimmed ? 'opacity-50' : ''}`}
      onClick={() => onOpenThread(message)}
    >
      <div
        className={`mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          active ? 'bg-violet-500 text-white' : 'bg-[#1f2335] text-[#565f89]'
        }`}
      >
        {avatarInitial(message.sessionId)}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-[#c0caf5]">Session</span>
          <span className="rounded bg-[#1f2335] px-1.5 py-0.5 font-mono text-xs text-[#565f89]">
            {message.sessionId.slice(0, 8)}
          </span>
          <span className="ml-auto text-xs text-[#565f89]">{formatTime(message.createdAt)}</span>
        </div>
        <MessagePreview text={preview} />
        {threadCount > 0 && (
          <div className="mt-1.5 text-xs text-violet-300 hover:underline">
            {threadCount} thread{threadCount > 1 ? 's' : ''}
          </div>
        )}
      </div>
    </button>
  );
}
