import type { SubscriptionResolvers } from './../../../types.generated';
import { pubsub, TOPICS } from '../../../../services/pubsub';

export const sessionEventUpdated: NonNullable<SubscriptionResolvers['sessionEventUpdated']> = {
  subscribe: (_parent, { channelId }) => {
    return pubsub.asyncIterableIterator(TOPICS.SESSION_EVENT_UPDATED(channelId));
  },
};
