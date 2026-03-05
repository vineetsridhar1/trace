import type { SubscriptionResolvers } from './../../../types.generated';
import { pubsub, TOPICS } from '../../../../services/pubsub';

export const ticketReadyForReview: NonNullable<SubscriptionResolvers['ticketReadyForReview']> = {
  subscribe: (_parent, { channelId }) => {
    return pubsub.asyncIterableIterator(TOPICS.TICKET_READY_FOR_REVIEW(channelId));
  },
};
