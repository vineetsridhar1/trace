import type { QueryResolvers } from './../../../types.generated';
import { getEventsBySession } from '../../../../services/workspaceService';

export const sessionEvents: NonNullable<QueryResolvers['sessionEvents']> = async (_parent, { sessionId, limit, offset, after }, _ctx) => {
  return getEventsBySession(sessionId, {
    limit: limit ?? undefined,
    offset: offset ?? undefined,
    after: after ?? undefined,
  });
};
