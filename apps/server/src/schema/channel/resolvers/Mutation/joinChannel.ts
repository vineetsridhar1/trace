import type { MutationResolvers } from './../../../types.generated';
import { requireAuth } from '../../../../lib/requireAuth';
import { joinChannel as joinChannelService } from '../../../../services/channelService';

export const joinChannel: NonNullable<MutationResolvers['joinChannel']> = async (_parent, { channelId }, ctx) => {
  const user = requireAuth(ctx);
  await joinChannelService(channelId, user.id);
  return true;
};
