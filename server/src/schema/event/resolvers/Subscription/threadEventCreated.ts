import type { SubscriptionResolvers } from './../../../types.generated';
import { pubsub, TOPICS } from '../../../../services/pubsub';

export const threadEventCreated: NonNullable<SubscriptionResolvers['threadEventCreated']> = {
  subscribe: (_parent, { channelId }) => {
    return pubsub.asyncIterableIterator(TOPICS.THREAD_EVENT_CREATED(channelId));
  },
};
