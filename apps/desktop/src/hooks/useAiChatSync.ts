import { useCallback } from 'react';
import { gql } from '@apollo/client';
import type { AiChat } from '../types';
import { useAiChatsLazyQuery, useCreateAiChatMutation, useDeleteAiChatMutation, useRenameAiChatMutation } from './__generated__/useAiChats.generated';
import { useAppUIStore } from '../stores/appUIStore';

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

export function useAiChatSync() {
  const [executeAiChats] = useAiChatsLazyQuery();
  const [executeCreateAiChat] = useCreateAiChatMutation();
  const [executeDeleteAiChat] = useDeleteAiChatMutation();
  const [executeRenameAiChat] = useRenameAiChatMutation();

  const fetchAiChats = useCallback(async (serverId: string) => {
    try {
      const { data } = await executeAiChats({
        variables: { serverId },
      });
      if (data) {
        useAppUIStore.getState().setAiChats(data.aiChats as AiChat[]);
      }
    } catch (err) {
      console.error('[useAiChatSync] fetchAiChats failed:', err);
    }
  }, [executeAiChats]);

  const createAiChat = useCallback(async (serverId: string, channelId?: string | null) => {
    try {
      const { data } = await executeCreateAiChat({
        variables: { serverId, channelId },
      });
      if (data) {
        const chat = data.createAiChat as AiChat;
        useAppUIStore.getState().prependAiChat(chat);
        return chat;
      }
    } catch (err) {
      console.error('[useAiChatSync] createAiChat failed:', err);
    }
    return null;
  }, [executeCreateAiChat]);

  const deleteAiChat = useCallback(async (id: string) => {
    try {
      await executeDeleteAiChat({ variables: { id } });
      useAppUIStore.getState().removeAiChat(id);
    } catch (err) {
      console.error('[useAiChatSync] deleteAiChat failed:', err);
    }
  }, [executeDeleteAiChat]);

  const renameAiChat = useCallback(async (id: string, title: string) => {
    try {
      await executeRenameAiChat({ variables: { id, title } });
      useAppUIStore.getState().upsertAiChat({ id, title });
    } catch (err) {
      console.error('[useAiChatSync] renameAiChat failed:', err);
    }
  }, [executeRenameAiChat]);

  return { fetchAiChats, createAiChat, deleteAiChat, renameAiChat };
}
