import { PubSub } from 'graphql-subscriptions';

export const pubsub = new PubSub();

export const TOPICS = {
  MESSAGE_UPSERTED: (channelId: string) => `MESSAGE_UPSERTED.${channelId}`,
  THREAD_EVENT_CREATED: (channelId: string) => `THREAD_EVENT_CREATED.${channelId}`,
  TICKET_UPSERTED: (channelId: string) => `TICKET_UPSERTED.${channelId}`,
} as const;
