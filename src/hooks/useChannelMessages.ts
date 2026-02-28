import { useCallback, useEffect, useRef, useState } from 'react';
import { gql, useSubscription } from '@apollo/client';
import { useChannelMessagesLazyQuery, useSendChannelMessageMutation } from './__generated__/useChannelMessages.generated';

export interface ChannelMessage {
  id: string;
  channelId: string;
  content: string;
  createdAt: string;
  author: { id: string; name: string; avatarUrl: string | null };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const GQL_CHANNEL_MESSAGES = gql`
  query ChannelMessages($channelId: ID!, $limit: Int, $offset: Int) {
    channelMessages(channelId: $channelId, limit: $limit, offset: $offset) {
      messages {
        id
        channelId
        content
        createdAt
        author {
          id
          name
          avatarUrl
        }
      }
      total
      limit
      offset
    }
  }
`;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const GQL_SEND_CHANNEL_MESSAGE = gql`
  mutation SendChannelMessage($channelId: ID!, $content: String!) {
    sendChannelMessage(channelId: $channelId, content: $content) {
      id
      channelId
      content
      createdAt
      author {
        id
        name
        avatarUrl
      }
    }
  }
`;

const CHANNEL_MESSAGE_CREATED_SUBSCRIPTION = gql`
  subscription ChannelMessageCreated($channelId: ID!) {
    channelMessageCreated(channelId: $channelId) {
      id
      channelId
      content
      createdAt
      author {
        id
        name
        avatarUrl
      }
    }
  }
`;

export function useChannelMessages(channelId: string | null) {
  const [fetchMessages] = useChannelMessagesLazyQuery();
  const [executeSendMessage] = useSendChannelMessageMutation();
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const seenIdsRef = useRef(new Set<string>());

  // Fetch messages when channelId changes
  useEffect(() => {
    if (!channelId) {
      setMessages([]);
      seenIdsRef.current.clear();
      return;
    }

    void (async () => {
      try {
        const { data } = await fetchMessages({ variables: { channelId, limit: 100 } });
        if (data) {
          const fetched = data.channelMessages.messages as ChannelMessage[];
          setMessages(fetched);
          seenIdsRef.current = new Set(fetched.map((m) => m.id));
        }
      } catch (err) {
        console.error('[useChannelMessages] fetch failed:', err);
      }
    })();
  }, [channelId, fetchMessages]);

  // Subscribe to new messages
  const { data: subData } = useSubscription(CHANNEL_MESSAGE_CREATED_SUBSCRIPTION, {
    variables: { channelId: channelId ?? '' },
    skip: !channelId,
  });

  useEffect(() => {
    if (!subData?.channelMessageCreated) return;
    const msg = subData.channelMessageCreated as ChannelMessage;
    if (seenIdsRef.current.has(msg.id)) return;
    seenIdsRef.current.add(msg.id);
    setMessages((prev) => [...prev, msg]);
  }, [subData]);

  const sendMessage = useCallback(async (content: string) => {
    if (!channelId || !content.trim()) return;
    try {
      const { data } = await executeSendMessage({
        variables: { channelId, content: content.trim() },
      });
      if (data) {
        const msg = data.sendChannelMessage as ChannelMessage;
        if (!seenIdsRef.current.has(msg.id)) {
          seenIdsRef.current.add(msg.id);
          setMessages((prev) => [...prev, msg]);
        }
      }
    } catch (err) {
      console.error('[useChannelMessages] sendMessage failed:', err);
    }
  }, [channelId, executeSendMessage]);

  return { messages, sendMessage };
}
