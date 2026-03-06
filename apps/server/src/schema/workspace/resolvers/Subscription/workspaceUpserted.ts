import type { SubscriptionResolvers } from './../../../types.generated';
import { pubsub, TOPICS } from '../../../../services/pubsub';

export const workspaceUpserted: NonNullable<SubscriptionResolvers['workspaceUpserted']> = {
  subscribe: (_parent, { channelId }) => {
    return pubsub.asyncIterableIterator(TOPICS.WORKSPACE_UPSERTED(channelId));
  },
};
