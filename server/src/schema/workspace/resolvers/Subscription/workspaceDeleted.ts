import type { SubscriptionResolvers } from './../../../types.generated';
import { pubsub, TOPICS } from '../../../../services/pubsub';

export const workspaceDeleted: NonNullable<SubscriptionResolvers['workspaceDeleted']> = {
  subscribe: (_parent, { channelId }) => {
    return pubsub.asyncIterableIterator(TOPICS.WORKSPACE_DELETED(channelId));
  },
};
