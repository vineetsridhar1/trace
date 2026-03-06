import type { SubscriptionResolvers } from './../../../types.generated';
import { pubsub, TOPICS } from '../../../../services/pubsub';

export const ticketReadyToRun: NonNullable<SubscriptionResolvers['ticketReadyToRun']> = {
  subscribe: (_parent, { channelId }) => {
    return pubsub.asyncIterableIterator(TOPICS.TICKET_READY_TO_RUN(channelId));
  },
};
