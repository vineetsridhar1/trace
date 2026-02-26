import { useCallback, useEffect, useRef, useState } from 'react';
import { gql, useApolloClient, useSubscription } from '@apollo/client';
import type { AiChatMessage } from '../types';

const GQL_AI_CHAT_MESSAGES = gql`
  query AiChatMessages($chatId: ID!, $limit: Int, $offset: Int) {
    aiChatMessages(chatId: $chatId, limit: $limit, offset: $offset) {
      messages {
        id
        chatId
        role
        content
        createdAt
      }
      total
      limit
      offset
    }
  }
`;

const GQL_SEND_AI_CHAT_MESSAGE = gql`
  mutation SendAiChatMessage($chatId: ID!, $content: String!) {
    sendAiChatMessage(chatId: $chatId, content: $content) {
      id
      chatId
      role
      content
      createdAt
    }
  }
`;

const AI_CHAT_STREAM_SUBSCRIPTION = gql`
  subscription AiChatStream($chatId: ID!) {
    aiChatStream(chatId: $chatId) {
      chatId
      type
      delta
      content
      error
    }
  }
`;

export function useAiChat(chatId: string | null) {
  const client = useApolloClient();
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [streamingContent, setStreamingContent] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const streamingContentRef = useRef('');

  // Fetch messages when chatId changes
  useEffect(() => {
    if (!chatId) {
      setMessages([]);
      return;
    }

    void (async () => {
      try {
        const { data } = await client.query<{
          aiChatMessages: { messages: AiChatMessage[]; total: number };
        }>({
          query: GQL_AI_CHAT_MESSAGES,
          variables: { chatId, limit: 100 },
        });
        if (data) {
          setMessages(data.aiChatMessages.messages);
        }
      } catch (err) {
        console.error('[useAiChat] fetch messages failed:', err);
      }
    })();
  }, [chatId, client]);

  // Subscribe to AI chat stream via GraphQL subscription
  const { data: streamData } = useSubscription(AI_CHAT_STREAM_SUBSCRIPTION, {
    variables: { chatId: chatId ?? '' },
    skip: !chatId,
  });

  useEffect(() => {
    if (!streamData?.aiChatStream || !chatId) return;
    const payload = streamData.aiChatStream;

    if (payload.type === 'token' && payload.delta) {
      streamingContentRef.current += payload.delta;
      setStreamingContent(streamingContentRef.current);
    } else if (payload.type === 'done') {
      if (payload.content) {
        const assistantMessage: AiChatMessage = {
          id: `msg-${Date.now()}`,
          chatId,
          role: 'assistant',
          content: payload.content,
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
      }
      streamingContentRef.current = '';
      setStreamingContent('');
      setIsStreaming(false);
    } else if (payload.type === 'error') {
      streamingContentRef.current = '';
      setStreamingContent('');
      setIsStreaming(false);
    }
  }, [streamData, chatId]);

  const sendMessage = useCallback(async (content: string) => {
    if (!chatId || !content.trim()) return;

    setIsStreaming(true);
    streamingContentRef.current = '';
    setStreamingContent('');

    try {
      const { data } = await client.mutate<{ sendAiChatMessage: AiChatMessage }>({
        mutation: GQL_SEND_AI_CHAT_MESSAGE,
        variables: { chatId, content: content.trim() },
      });
      if (data) {
        setMessages((prev) => [...prev, data.sendAiChatMessage]);
      }
    } catch (err) {
      console.error('[useAiChat] sendMessage failed:', err);
      setIsStreaming(false);
    }
  }, [chatId, client]);

  return { messages, streamingContent, isStreaming, sendMessage };
}
