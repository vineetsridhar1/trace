import type { QueryResolvers } from './../../../types.generated';
import { getChannelMessages } from '../../../../services/channelMessageService';
import { requireAuth } from '../../../../lib/requireAuth';

export const channelMessages: NonNullable<QueryResolvers['channelMessages']> = async (_parent, { channelId, limit, offset }, ctx) => {
  requireAuth(ctx);
  return getChannelMessages(channelId, {
    limit: limit ?? undefined,
    offset: offset ?? undefined,
  });
};
