import type { SubscriptionResolvers } from './../../../types.generated';
import { pubsub, TOPICS } from '../../../../services/pubsub';

export const threadEventUpdated: NonNullable<SubscriptionResolvers['threadEventUpdated']> = {
  subscribe: (_parent, { channelId }) => {
    return pubsub.asyncIterableIterator(TOPICS.THREAD_EVENT_UPDATED(channelId));
  },
};
