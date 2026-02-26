import type { QueryResolvers } from './../../../types.generated';
import { getEventsByMessage } from '../../../../services/messageService';

export const messageEvents: NonNullable<QueryResolvers['messageEvents']> = async (_parent, { messageId, limit, offset, after }, _ctx) => {
  return getEventsByMessage(messageId, {
    limit: limit ?? undefined,
    offset: offset ?? undefined,
    after: after ?? undefined,
  });
};
