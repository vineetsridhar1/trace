import type { QueryResolvers } from './../../../types.generated';
import { getEventsBySession } from '../../../../services/eventService';

export const sessionEvents: NonNullable<QueryResolvers['sessionEvents']> = async (_parent, { sessionId, hookEventName, toolName, after, limit, offset }, _ctx) => {
  return getEventsBySession(sessionId, {
    hookEventName: hookEventName ?? undefined,
    toolName: toolName ?? undefined,
    limit: limit ?? undefined,
    offset: offset ?? undefined,
    after: after ?? undefined,
  });
};
