import type { MessageResolvers } from './../../types.generated';

export const Message: MessageResolvers = {
  threadCount: (parent, _arg, _ctx) => {
    return parent._count.threads;
  },
    queuedRunConfig: async (_parent, _arg, _ctx) => { /* Message.queuedRunConfig resolver is required because Message.queuedRunConfig exists but MessageMapper.queuedRunConfig does not */ }
};
