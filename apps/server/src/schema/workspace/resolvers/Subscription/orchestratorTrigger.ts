import type { SubscriptionResolvers } from './../../../types.generated';
import { pubsub, TOPICS } from '../../../../services/pubsub';

export const orchestratorTrigger: NonNullable<SubscriptionResolvers['orchestratorTrigger']> = {
  subscribe: (_parent, { serverId }) => {
    return pubsub.asyncIterableIterator(TOPICS.ORCHESTRATOR_TRIGGER(serverId));
  },
};
