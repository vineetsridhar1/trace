import { PubSub } from 'graphql-subscriptions';

export const pubsub = new PubSub();

export const TOPICS = {
  WORKSPACE_UPSERTED: (channelId: string) => `MESSAGE_UPSERTED.${channelId}`,
  WORKSPACE_DELETED: (channelId: string) => `MESSAGE_DELETED.${channelId}`,
  SESSION_EVENT_CREATED: (channelId: string) => `THREAD_EVENT_CREATED.${channelId}`,
  SESSION_EVENT_UPDATED: (channelId: string) => `THREAD_EVENT_UPDATED.${channelId}`,
  TICKET_UPSERTED: (channelId: string) => `TICKET_UPSERTED.${channelId}`,
  TICKET_READY_TO_RUN: (channelId: string) => `TICKET_READY_TO_RUN.${channelId}`,
  AI_CHAT_STREAM: (chatId: string) => `AI_CHAT_STREAM.${chatId}`,
  CHANNEL_MESSAGE_CREATED: (channelId: string) => `CHANNEL_MESSAGE_CREATED.${channelId}`,
  CHANNEL_MESSAGE_CREATED_SERVER: (serverId: string) => `CHANNEL_MESSAGE_CREATED_SERVER.${serverId}`,
  CHANNEL_CHANGED_SERVER: (serverId: string) => `CHANNEL_CHANGED_SERVER.${serverId}`,
  PRESENCE_UPDATED: (channelId: string) => `PRESENCE_UPDATED.${channelId}`,
} as const;
