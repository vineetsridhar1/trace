import type { ThreadResolvers } from './../../types.generated';

export const Thread: ThreadResolvers = {
  eventCount: (parent, _arg, _ctx) => {
    return parent._count?.events ?? 0;
  },
};
