import { useCallback, useRef, useState } from 'react';
import type { ChannelMessage } from '../types';
import { SERVER_URL } from '../types';

export function useMessages() {
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const messagesRef = useRef<ChannelMessage[]>([]);
  messagesRef.current = messages;

  const upsertMessage = useCallback((message: ChannelMessage) => {
    setMessages((current) => {
      const existingIndex = current.findIndex((item) => item.id === message.id);
      const next = [...current];

      if (existingIndex >= 0) {
        next[existingIndex] = message;
      } else {
        next.push(message);
      }

      next.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      return next;
    });
  }, []);

  const refreshMessages = useCallback(async (channelId: string) => {
    try {
      const res = await fetch(`${SERVER_URL}/channels/${channelId}/messages?limit=200`);
      if (!res.ok) return;

      const { messages: fetched } = await res.json();
      const ordered = (fetched as ChannelMessage[]).sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
      setMessages(ordered);
    } catch {
      // Server may not be up yet.
    }
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return { messages, messagesRef, upsertMessage, refreshMessages, clearMessages };
}
