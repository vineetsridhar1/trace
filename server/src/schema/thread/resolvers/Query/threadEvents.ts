import type { QueryResolvers } from './../../../types.generated';
import { getEventsByThread } from '../../../../services/messageService';

export const threadEvents: NonNullable<QueryResolvers['threadEvents']> = async (_parent, { threadId, limit, offset, after }, _ctx) => {
  return getEventsByThread(threadId, {
    limit: limit ?? undefined,
    offset: offset ?? undefined,
    after: after ?? undefined,
  });
};
