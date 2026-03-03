import type { SubscriptionResolvers } from './../../../types.generated';
import { pubsub, TOPICS } from '../../../../services/pubsub';

export const presenceUpdated: NonNullable<SubscriptionResolvers['presenceUpdated']> = {
  subscribe: (_parent, { channelId }) => {
    return pubsub.asyncIterableIterator(TOPICS.PRESENCE_UPDATED(channelId));
  },
};
