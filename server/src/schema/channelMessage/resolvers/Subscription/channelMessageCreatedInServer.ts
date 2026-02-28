import type { SubscriptionResolvers } from './../../../types.generated';
import { pubsub, TOPICS } from '../../../../services/pubsub';

export const channelMessageCreatedInServer: NonNullable<SubscriptionResolvers['channelMessageCreatedInServer']> = {
  subscribe: (_parent, { serverId }) => {
    return pubsub.asyncIterableIterator(TOPICS.CHANNEL_MESSAGE_CREATED_SERVER(serverId));
  },
};
