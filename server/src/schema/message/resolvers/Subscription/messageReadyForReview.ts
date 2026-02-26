import type { SubscriptionResolvers } from './../../../types.generated';
import { pubsub, TOPICS } from '../../../../services/pubsub';

export const messageReadyForReview: NonNullable<SubscriptionResolvers['messageReadyForReview']> = {
  subscribe: (_parent, { channelId }) => {
    return pubsub.asyncIterableIterator(TOPICS.MESSAGE_READY_FOR_REVIEW(channelId));
  },
};
