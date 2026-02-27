import type { SubscriptionResolvers } from './../../../types.generated';
import { pubsub, TOPICS } from '../../../../services/pubsub';

export const workspaceReadyForReview: NonNullable<SubscriptionResolvers['workspaceReadyForReview']> = {
  subscribe: (_parent, { channelId }) => {
    return pubsub.asyncIterableIterator(TOPICS.WORKSPACE_READY_FOR_REVIEW(channelId));
  },
};
