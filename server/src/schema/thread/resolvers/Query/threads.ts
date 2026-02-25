import type { QueryResolvers } from './../../../types.generated';
import { getThreadsByMessage } from '../../../../services/messageService';

export const threads: NonNullable<QueryResolvers['threads']> = async (_parent, { messageId }, _ctx) => {
  return getThreadsByMessage(messageId);
};
