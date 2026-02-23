import { useEffect, useRef, useState } from 'react';
import type { ChannelMessage, MessageEnvelope, ThreadEventEnvelope } from '../types';
import { SERVER_URL } from '../types';

interface UseSseOptions {
  activeChannelId: string | null;
  upsertMessage: (message: ChannelMessage) => void;
  loadThreadEvents: (message: ChannelMessage) => Promise<void>;
  reportClaudeActivity: (messageId: string, eventType: string) => Promise<void>;
  selectedMessageIdRef: React.RefObject<string | null>;
  messagesRef: React.RefObject<ChannelMessage[]>;
  selectedMessageRef: React.RefObject<ChannelMessage | null>;
  onNeedsAttention?: (messageId: string, reason: 'completed' | 'stopped') => void;
}

export function useSse({
  activeChannelId,
  upsertMessage,
  loadThreadEvents,
  reportClaudeActivity,
  selectedMessageIdRef,
  messagesRef,
  selectedMessageRef,
  onNeedsAttention,
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

    const source = new EventSource(`${SERVER_URL}/sse/channels/${activeChannelId}`);
    activeSseRef.current = source;
    setSseConnected(false);

    source.addEventListener('connected', () => setSseConnected(true));

    source.addEventListener('message-created', (evt) => {
      const payload = JSON.parse((evt as MessageEvent).data) as MessageEnvelope;
      if (payload.channelId !== activeChannelRef.current) return;
      upsertMessage(payload.message);
    });

    source.addEventListener('message-upsert', (evt) => {
      const payload = JSON.parse((evt as MessageEvent).data) as MessageEnvelope;
      if (payload.channelId !== activeChannelRef.current) return;

      // Detect completion transitions for attention notification
      if (onNeedsAttention && payload.message.status === 'completed') {
        const prev = messagesRef.current.find((m) => m.id === payload.message.id);
        if (prev && prev.status !== 'completed') {
          const notViewing = selectedMessageIdRef.current !== payload.message.id || document.hidden;
          if (notViewing) {
            onNeedsAttention(payload.message.id, 'completed');
          }
        }
      }

      upsertMessage(payload.message);
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

        if (onNeedsAttention) {
          const notViewing = selectedMessageIdRef.current !== payload.messageId || document.hidden;
          if (notViewing) {
            onNeedsAttention(payload.messageId, 'stopped');
          }
        }
      }

      if (selectedMessageIdRef.current !== payload.messageId) return;

      const message =
        messagesRef.current.find((item) => item.id === payload.messageId) ?? selectedMessageRef.current;
      if (message) void loadThreadEvents(message);
    });

    source.addEventListener('error', () => setSseConnected(false));

    return () => {
      source.close();
      if (activeSseRef.current === source) activeSseRef.current = null;
    };
  }, [activeChannelId, loadThreadEvents, reportClaudeActivity, upsertMessage, selectedMessageIdRef, messagesRef, selectedMessageRef, onNeedsAttention]);

  return { sseConnected, activeChannelRef };
}
