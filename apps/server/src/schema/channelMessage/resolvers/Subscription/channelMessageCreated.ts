import type { SubscriptionResolvers } from './../../../types.generated';
import { pubsub, TOPICS } from '../../../../services/pubsub';

export const channelMessageCreated: NonNullable<SubscriptionResolvers['channelMessageCreated']> = {
  subscribe: (_parent, { channelId }) => {
    return pubsub.asyncIterableIterator(TOPICS.CHANNEL_MESSAGE_CREATED(channelId));
  },
};
