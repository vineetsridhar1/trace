import type { SubscriptionResolvers } from './../../../types.generated';
import { pubsub, TOPICS } from '../../../../services/pubsub';

export const aiChatStream: NonNullable<SubscriptionResolvers['aiChatStream']> = {
  subscribe: (_parent, { chatId }) => {
    return pubsub.asyncIterableIterator(TOPICS.AI_CHAT_STREAM(chatId));
  },
};
