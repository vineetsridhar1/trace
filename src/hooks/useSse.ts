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
}

export function useSse({
  activeChannelId,
  upsertMessage,
  loadThreadEvents,
  reportClaudeActivity,
  selectedMessageIdRef,
  messagesRef,
  selectedMessageRef,
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
  }, [activeChannelId, loadThreadEvents, reportClaudeActivity, upsertMessage, selectedMessageIdRef, messagesRef, selectedMessageRef]);

  return { sseConnected, activeChannelRef };
}
