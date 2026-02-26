import { useCallback, useRef, useState } from 'react';
import { gql, useApolloClient } from '@apollo/client';
import type { ChannelMessage } from '../types';
import { MESSAGE_FIELDS } from '../graphql/fragments';
import { MessagesDocument, type MessagesQuery } from './__generated__/useMessages.generated';

const GQL_MESSAGES = gql`
  query Messages($channelId: ID!, $limit: Int, $offset: Int) {
    messages(channelId: $channelId, limit: $limit, offset: $offset) {
      messages {
        ...MessageFields
      }
      total
      limit
      offset
    }
  }
  ${MESSAGE_FIELDS}
`;

export function useMessages() {
  const client = useApolloClient();
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
      const { data } = await client.query<MessagesQuery>({
        query: MessagesDocument,
        variables: { channelId, limit: 200 },
      });
      if (!data) return;

      const fetched = [...data.messages.messages].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ) as ChannelMessage[];
      setMessages(fetched);
    } catch (err) {
      console.error('[useMessages] refreshMessages failed:', err);
    }
  }, [client]);

  const removeMessage = useCallback((messageId: string) => {
    setMessages((current) => current.filter((item) => item.id !== messageId));
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return { messages, messagesRef, upsertMessage, removeMessage, refreshMessages, clearMessages };
}
