import { useCallback, useEffect, useRef, useState } from 'react';
import { gql, useSubscription } from '@apollo/client';
import { useAiChatMessagesLazyQuery, useSendAiChatMessageMutation } from './__generated__/useAiChat.generated';
import type { AiChatMessage } from '../types';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  const [fetchMessages] = useAiChatMessagesLazyQuery();
  const [executeSendMessage] = useSendAiChatMessageMutation();
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
        const { data } = await fetchMessages({ variables: { chatId, limit: 100 } });
        if (data) {
          setMessages(data.aiChatMessages.messages as AiChatMessage[]);
        }
      } catch (err) {
        console.error('[useAiChat] fetch messages failed:', err);
      }
    })();
  }, [chatId, fetchMessages]);

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
      const { data } = await executeSendMessage({
        variables: { chatId, content: content.trim() },
      });
      if (data) {
        setMessages((prev) => [...prev, data.sendAiChatMessage as AiChatMessage]);
      }
    } catch (err) {
      console.error('[useAiChat] sendMessage failed:', err);
      setIsStreaming(false);
    }
  }, [chatId, executeSendMessage]);

  return { messages, streamingContent, isStreaming, sendMessage };
}
