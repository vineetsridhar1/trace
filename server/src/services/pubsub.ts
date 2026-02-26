import { PubSub } from 'graphql-subscriptions';

export const pubsub = new PubSub();

export const TOPICS = {
  MESSAGE_UPSERTED: (channelId: string) => `MESSAGE_UPSERTED.${channelId}`,
  MESSAGE_DELETED: (channelId: string) => `MESSAGE_DELETED.${channelId}`,
  THREAD_EVENT_CREATED: (channelId: string) => `THREAD_EVENT_CREATED.${channelId}`,
  THREAD_EVENT_UPDATED: (channelId: string) => `THREAD_EVENT_UPDATED.${channelId}`,
  TICKET_UPSERTED: (channelId: string) => `TICKET_UPSERTED.${channelId}`,
  TICKET_READY_TO_RUN: (channelId: string) => `TICKET_READY_TO_RUN.${channelId}`,
  AI_CHAT_STREAM: (chatId: string) => `AI_CHAT_STREAM.${chatId}`,
} as const;
