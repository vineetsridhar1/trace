import type { MutationResolvers } from './../../../types.generated';
import { createChannelMessage } from '../../../../services/channelMessageService';
import { requireAuth } from '../../../../lib/requireAuth';

export const sendChannelMessage: NonNullable<MutationResolvers['sendChannelMessage']> = async (_parent, { channelId, content }, ctx) => {
  const user = requireAuth(ctx);
  return createChannelMessage(channelId, user.id, content);
};
