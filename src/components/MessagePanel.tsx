import { useCallback, useEffect, useRef } from 'react';
import type { ChannelMessage } from '../types';
import { avatarInitial, formatTime } from '../utils';

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
        className="flex min-h-0 flex-1 flex-col justify-end overflow-y-auto px-2 py-2"
      >
        {messages.map((message) => (
          <MessageItem
            key={message.id}
            message={message}
            isSelected={message.id === selectedMessageId}
            onOpenThread={onOpenThread}
          />
        ))}
      </div>

      <div className="border-t border-[#292e42] px-3 py-3">
        <div className="flex items-center gap-2">
          <input
            id="message-input"
            type="text"
            value={messageInput}
            onChange={(e) => onMessageInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSendMessage();
              }
            }}
            placeholder="Send a message..."
            className="flex-1 rounded-lg border border-[#292e42] bg-[#1f2335] px-3 py-2 text-sm text-[#c0caf5] outline-none transition-colors placeholder:text-[#565f89] focus:border-violet-500"
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
    </div>
  );
}

function MessageItem({
  message,
  isSelected,
  onOpenThread,
}: {
  message: ChannelMessage;
  isSelected: boolean;
  onOpenThread: (message: ChannelMessage) => void;
}) {
  const active = message.session.status !== 'stopped';
  const preview = message.preview || message.session.cwd || message.sessionId;
  const threadCount = message._count.threads;

  return (
    <button
      type="button"
      className={`message-item flex cursor-pointer items-start gap-3 border-l-2 border-transparent px-3 py-3 text-left transition-colors ${
        isSelected ? 'selected' : ''
      }`}
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
        <div className="mt-1 truncate text-sm text-[#a9b1d6]">{preview}</div>
        {threadCount > 0 && (
          <div className="mt-1.5 text-xs text-violet-300 hover:underline">
            {threadCount} thread{threadCount > 1 ? 's' : ''}
          </div>
        )}
      </div>
    </button>
  );
}
