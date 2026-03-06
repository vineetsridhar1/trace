import type { SubscriptionResolvers } from './../../../types.generated';
import { pubsub, TOPICS } from '../../../../services/pubsub';

export const channelChangedInServer: NonNullable<SubscriptionResolvers['channelChangedInServer']> = {
  subscribe: (_parent, { serverId }) => {
    return pubsub.asyncIterableIterator(TOPICS.CHANNEL_CHANGED_SERVER(serverId));
  },
};
