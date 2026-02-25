import type { MessageResolvers } from './../../types.generated';

export const Message: MessageResolvers = {
  threadCount: (parent, _arg, _ctx) => {
    return parent._count.threads;
  },
};
