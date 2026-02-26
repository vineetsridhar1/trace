import { useCallback, useState } from 'react';
import { gql, useApolloClient } from '@apollo/client';
import type { AiChat } from '../types';

const GQL_AI_CHATS = gql`
  query AiChats($serverId: ID!) {
    aiChats(serverId: $serverId) {
      id
      serverId
      channelId
      title
      lastMessage
      createdAt
      updatedAt
    }
  }
`;

const GQL_CREATE_AI_CHAT = gql`
  mutation CreateAiChat($serverId: ID!, $channelId: ID, $title: String) {
    createAiChat(serverId: $serverId, channelId: $channelId, title: $title) {
      id
      serverId
      channelId
      title
      lastMessage
      createdAt
      updatedAt
    }
  }
`;

const GQL_DELETE_AI_CHAT = gql`
  mutation DeleteAiChat($id: ID!) {
    deleteAiChat(id: $id)
  }
`;

const GQL_RENAME_AI_CHAT = gql`
  mutation RenameAiChat($id: ID!, $title: String!) {
    renameAiChat(id: $id, title: $title) {
      id
      title
    }
  }
`;

export function useAiChats() {
  const client = useApolloClient();
  const [aiChats, setAiChats] = useState<AiChat[]>([]);

  const fetchAiChats = useCallback(async (serverId: string) => {
    try {
      const { data } = await client.query<{ aiChats: AiChat[] }>({
        query: GQL_AI_CHATS,
        variables: { serverId },
      });
      if (data) {
        setAiChats(data.aiChats);
      }
    } catch (err) {
      console.error('[useAiChats] fetchAiChats failed:', err);
    }
  }, [client]);

  const createAiChat = useCallback(async (serverId: string, channelId?: string | null) => {
    try {
      const { data } = await client.mutate<{ createAiChat: AiChat }>({
        mutation: GQL_CREATE_AI_CHAT,
        variables: { serverId, channelId },
      });
      if (data) {
        setAiChats((prev) => [data.createAiChat, ...prev]);
        return data.createAiChat;
      }
    } catch (err) {
      console.error('[useAiChats] createAiChat failed:', err);
    }
    return null;
  }, [client]);

  const deleteAiChat = useCallback(async (id: string) => {
    try {
      await client.mutate({ mutation: GQL_DELETE_AI_CHAT, variables: { id } });
      setAiChats((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      console.error('[useAiChats] deleteAiChat failed:', err);
    }
  }, [client]);

  const renameAiChat = useCallback(async (id: string, title: string) => {
    try {
      await client.mutate({ mutation: GQL_RENAME_AI_CHAT, variables: { id, title } });
      setAiChats((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
    } catch (err) {
      console.error('[useAiChats] renameAiChat failed:', err);
    }
  }, [client]);

  const updateAiChatInList = useCallback((chat: Partial<AiChat> & { id: string }) => {
    setAiChats((prev) => prev.map((c) => (c.id === chat.id ? { ...c, ...chat } : c)));
  }, []);

  return { aiChats, fetchAiChats, createAiChat, deleteAiChat, renameAiChat, updateAiChatInList };
}
