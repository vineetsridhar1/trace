import type { SubscriptionResolvers } from './../../../types.generated';
import { pubsub, TOPICS } from '../../../../services/pubsub';

export const messageUpserted: NonNullable<SubscriptionResolvers['messageUpserted']> = {
  subscribe: (_parent, { channelId }) => {
    return pubsub.asyncIterableIterator(TOPICS.MESSAGE_UPSERTED(channelId));
  },
};
