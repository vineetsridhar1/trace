import type { QueryResolvers } from './../../../types.generated';
import { getEventsByCliSession } from '../../../../services/eventService';

export const cliSessionEvents: NonNullable<QueryResolvers['cliSessionEvents']> = async (_parent, { sessionId, hookEventName, toolName, after, limit, offset }, _ctx) => {
  return getEventsByCliSession(sessionId, {
    hookEventName: hookEventName ?? undefined,
    toolName: toolName ?? undefined,
    limit: limit ?? undefined,
    offset: offset ?? undefined,
    after: after ?? undefined,
  });
};
