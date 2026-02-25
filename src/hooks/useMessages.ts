import { useCallback, useRef, useState } from 'react';
import type { ChannelMessage } from '../types';
import { graphqlClient } from '../graphql/client';
import { MESSAGES_QUERY } from '../graphql/documents/messages';

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
      const result = await graphqlClient.query(MESSAGES_QUERY, { channelId, limit: 200 }, { requestPolicy: 'network-only' }).toPromise();
      if (!result.data) return;

      const fetched = (result.data.messages.messages as ChannelMessage[]).sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
      setMessages(fetched);
    } catch {
      // Server may not be up yet.
    }
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return { messages, messagesRef, upsertMessage, refreshMessages, clearMessages };
}
