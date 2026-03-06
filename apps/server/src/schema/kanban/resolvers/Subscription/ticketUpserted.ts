import type { SubscriptionResolvers } from './../../../types.generated';
import { pubsub, TOPICS } from '../../../../services/pubsub';

export const ticketUpserted: NonNullable<SubscriptionResolvers['ticketUpserted']> = {
  subscribe: (_parent, { channelId }) => {
    return pubsub.asyncIterableIterator(TOPICS.TICKET_UPSERTED(channelId));
  },
};
