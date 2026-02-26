import { useEffect, useRef, useState } from 'react';
import type { ChannelMessage, KanbanTicket, MessageEnvelope, ServerEvent, ThreadEventEnvelope, TicketEnvelope } from '../types';
import { getServerUrl } from '../types';

// SSE broadcasts send raw Prisma data with _count.threads, but our ChannelMessage type uses threadCount.
// Normalize the shape at the SSE boundary.
function normalizeMessage(raw: MessageEnvelope['message']): ChannelMessage {
  const msg = raw as ChannelMessage & { _count?: { threads: number } };
  return {
    ...msg,
    threadCount: msg.threadCount ?? msg._count?.threads ?? 0,
  };
}

interface UseSseOptions {
  activeChannelId: string | null;
  upsertMessage: (message: ChannelMessage) => void;
  removeMessage: (messageId: string) => void;
  appendThreadEvent: (event: ServerEvent) => void;
  reportClaudeActivity: (messageId: string, eventType: string) => Promise<void>;
  selectedMessageIdRef: React.RefObject<string | null>;
  activeThreadIdRef: React.RefObject<string | null>;
  messagesRef: React.RefObject<ChannelMessage[]>;
  selectedMessageRef: React.RefObject<ChannelMessage | null>;
  onNeedsAttention: (messageId: string, reason: 'stopped' | 'ask-user-question' | 'completed') => void;
  upsertTicket?: (ticket: KanbanTicket) => void;
}

export function useSse({
  activeChannelId,
  upsertMessage,
  removeMessage,
  appendThreadEvent,
  reportClaudeActivity,
  selectedMessageIdRef,
  activeThreadIdRef,
  messagesRef,
  selectedMessageRef,
  onNeedsAttention,
  upsertTicket,
}: UseSseOptions) {
  const [sseConnected, setSseConnected] = useState(false);
  const activeSseRef = useRef<EventSource | null>(null);
  const activeChannelRef = useRef<string | null>(null);
  activeChannelRef.current = activeChannelId;

  useEffect(() => {
    if (activeSseRef.current) {
      activeSseRef.current.close();
      activeSseRef.current = null;
    }

    if (!activeChannelId) return;

    const source = new EventSource(`${getServerUrl()}/sse/channels/${activeChannelId}`);
    activeSseRef.current = source;
    setSseConnected(false);

    source.addEventListener('connected', () => setSseConnected(true));

    source.addEventListener('message-created', (evt) => {
      const payload = JSON.parse((evt as MessageEvent).data) as MessageEnvelope;
      if (payload.channelId !== activeChannelRef.current) return;
      upsertMessage(normalizeMessage(payload.message));
    });

    source.addEventListener('message-upsert', (evt) => {
      const payload = JSON.parse((evt as MessageEvent).data) as MessageEnvelope;
      if (payload.channelId !== activeChannelRef.current) return;
      const message = normalizeMessage(payload.message);

      // Detect completion transitions for attention notification
      if (onNeedsAttention && message.status === 'completed') {
        const prev = messagesRef.current.find((m) => m.id === message.id);
        if (prev && prev.status !== 'completed') {
          const notViewing = selectedMessageIdRef.current !== message.id || document.hidden;
          if (notViewing) {
            onNeedsAttention(message.id, 'completed');
          }
        }
      }

      upsertMessage(message);
    });

    source.addEventListener('message-deleted', (evt) => {
      const payload = JSON.parse((evt as MessageEvent).data) as { channelId: string; messageId: string };
      if (payload.channelId !== activeChannelRef.current) return;
      removeMessage(payload.messageId);
    });

    source.addEventListener('thread-event-created', (evt) => {
      const payload = JSON.parse((evt as MessageEvent).data) as ThreadEventEnvelope;
      if (payload.channelId !== activeChannelRef.current) return;

      void reportClaudeActivity(payload.messageId, payload.event.hookEventName);

      if (payload.event.hookEventName === 'Stop') {
        const existing = messagesRef.current.find((item) => item.id === payload.messageId);
        if (existing && existing.session.status !== 'stopped') {
          upsertMessage({
            ...existing,
            session: { ...existing.session, status: 'stopped' },
          });
        }
        if (selectedMessageIdRef.current !== payload.messageId) {
          const reason = payload.event.toolName === 'AskUserQuestion' ? 'ask-user-question' : 'stopped';
          onNeedsAttention(payload.messageId, reason);
        }
      }

      if (payload.event.hookEventName === 'AskUserQuestion') {
        if (selectedMessageIdRef.current !== payload.messageId) {
          onNeedsAttention(payload.messageId, 'ask-user-question');
        }
      }

      if (selectedMessageIdRef.current !== payload.messageId) return;

      // Only append events belonging to the active thread
      const currentThreadId = activeThreadIdRef.current;
      if (currentThreadId && payload.event.threadId !== currentThreadId) return;

      appendThreadEvent(payload.event);
    });

    source.addEventListener('ticket-created', (evt) => {
      if (!upsertTicket) return;
      const payload = JSON.parse((evt as MessageEvent).data) as TicketEnvelope;
      if (payload.channelId !== activeChannelRef.current) return;
      upsertTicket(payload.ticket);
    });

    source.addEventListener('ticket-updated', (evt) => {
      if (!upsertTicket) return;
      const payload = JSON.parse((evt as MessageEvent).data) as TicketEnvelope;
      if (payload.channelId !== activeChannelRef.current) return;
      upsertTicket(payload.ticket);
    });

    source.addEventListener('error', () => setSseConnected(false));

    return () => {
      source.close();
      if (activeSseRef.current === source) activeSseRef.current = null;
    };
  }, [activeChannelId, appendThreadEvent, reportClaudeActivity, upsertMessage, removeMessage, selectedMessageIdRef, messagesRef, selectedMessageRef, onNeedsAttention, upsertTicket]);

  return { sseConnected, activeChannelRef };
}
