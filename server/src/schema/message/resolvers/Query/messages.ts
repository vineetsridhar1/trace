import type { QueryResolvers } from './../../../types.generated';
import { getMessagesByChannel } from '../../../../services/messageService';

export const messages: NonNullable<QueryResolvers['messages']> = async (_parent, { channelId, limit, offset }, _ctx) => {
  return getMessagesByChannel(channelId, {
    limit: limit ?? undefined,
    offset: offset ?? undefined,
  });
};
