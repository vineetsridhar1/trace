import { useCallback, useEffect, useRef, useState } from 'react';
import { gql, useApolloClient } from '@apollo/client';
import { getServerUrl } from '../types';
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

export function useAiChat(chatId: string | null) {
  const client = useApolloClient();
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [streamingContent, setStreamingContent] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
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

  // SSE connection for streaming
  useEffect(() => {
    if (!chatId) return;

    const es = new EventSource(`${getServerUrl()}/sse/ai-chats/${chatId}`);
    eventSourceRef.current = es;

    es.addEventListener('token', (e) => {
      const data = JSON.parse(e.data) as { delta: string };
      streamingContentRef.current += data.delta;
      setStreamingContent(streamingContentRef.current);
    });

    es.addEventListener('done', (e) => {
      const data = JSON.parse(e.data) as { content: string };
      if (data.content) {
        const assistantMessage: AiChatMessage = {
          id: `msg-${Date.now()}`,
          chatId,
          role: 'assistant',
          content: data.content,
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
      }
      streamingContentRef.current = '';
      setStreamingContent('');
      setIsStreaming(false);
    });

    es.addEventListener('error', () => {
      streamingContentRef.current = '';
      setStreamingContent('');
      setIsStreaming(false);
    });

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [chatId]);

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
