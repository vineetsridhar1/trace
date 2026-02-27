import type { SessionResolvers } from './../../types.generated';

export const Session: SessionResolvers = {
  eventCount: (parent, _arg, _ctx) => {
    return parent._count?.events ?? 0;
  },
};
