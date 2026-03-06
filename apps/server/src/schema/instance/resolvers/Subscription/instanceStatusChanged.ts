import type { SubscriptionResolvers } from './../../../types.generated';
import { pubsub, TOPICS } from '../../../../services/pubsub';

export const instanceStatusChanged: NonNullable<SubscriptionResolvers['instanceStatusChanged']> = {
  subscribe: (_parent, { serverId }) => {
    return pubsub.asyncIterableIterator(TOPICS.INSTANCE_STATUS_CHANGED(serverId));
  },
};
