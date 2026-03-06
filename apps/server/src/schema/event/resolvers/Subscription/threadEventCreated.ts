import type { SubscriptionResolvers } from './../../../types.generated';
import { pubsub, TOPICS } from '../../../../services/pubsub';

export const sessionEventCreated: NonNullable<SubscriptionResolvers['sessionEventCreated']> = {
  subscribe: (_parent, { channelId }) => {
    return pubsub.asyncIterableIterator(TOPICS.SESSION_EVENT_CREATED(channelId));
  },
};
