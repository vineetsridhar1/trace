import type { SubscriptionResolvers } from './../../../types.generated';
import { pubsub, TOPICS } from '../../../../services/pubsub';

export const messageDeleted: NonNullable<SubscriptionResolvers['messageDeleted']> = {
  subscribe: (_parent, { channelId }) => {
    return pubsub.asyncIterableIterator(TOPICS.MESSAGE_DELETED(channelId));
  },
};
