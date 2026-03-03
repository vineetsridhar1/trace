import { useCallback, useEffect, useRef, useState } from 'react';
import { FiSend, FiMessageCircle } from 'react-icons/fi';
import { useAiChat } from '../hooks/useAiChat';

interface AiChatPanelProps {
  chatId: string;
  chatTitle: string;
}

export function AiChatPanel({ chatId, chatTitle }: AiChatPanelProps) {
  const { messages, streamingContent, isStreaming, sendMessage } = useAiChat(chatId);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent, scrollToBottom]);

  const handleSend = useCallback(() => {
    if (!input.trim() || isStreaming) return;
    void sendMessage(input);
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [input, isStreaming, sendMessage]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
  }, []);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-edge px-4 py-3">
        <FiMessageCircle className="h-4 w-4 text-accent-light" />
        <h2 className="text-sm font-semibold text-primary">{chatTitle}</h2>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 && !streamingContent && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <FiMessageCircle className="mx-auto mb-2 h-8 w-8 text-muted" />
              <p className="text-sm text-muted">Start a conversation</p>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`mb-3 ${msg.role === 'user' ? 'flex justify-end' : ''}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                msg.role === 'user'
                  ? 'bg-accent text-on-accent'
                  : 'bg-surface-elevated text-primary'
              }`}
            >
              <div className="whitespace-pre-wrap break-words">{msg.content}</div>
            </div>
          </div>
        ))}

        {streamingContent && (
          <div className="mb-3">
            <div className="max-w-[85%] rounded-lg bg-surface-elevated px-3 py-2 text-sm text-primary">
              <div className="whitespace-pre-wrap break-words">{streamingContent}</div>
              <span className="inline-block h-4 w-1 animate-pulse bg-accent-light" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-edge px-4 py-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your code..."
            rows={1}
            className="flex-1 resize-none rounded-lg border border-edge bg-surface px-3 py-2 text-sm text-primary placeholder-muted focus:border-accent-light focus:outline-none"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            className="rounded-lg bg-accent-light p-2 text-on-accent transition-colors hover:bg-accent-light disabled:opacity-40"
          >
            <FiSend className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
