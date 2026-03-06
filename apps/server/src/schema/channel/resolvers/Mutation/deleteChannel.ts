import type { MutationResolvers } from './../../../types.generated';
import prisma from '../../../../lib/prisma';
import { deleteChannel as deleteChannelService } from '../../../../services/channelService';
import { pubsub, TOPICS } from '../../../../services/pubsub';

export const deleteChannel: NonNullable<MutationResolvers['deleteChannel']> = async (_parent, { id }, _ctx) => {
  const channel = await prisma.channel.findUnique({ where: { id }, select: { serverId: true } });
  await deleteChannelService(id);
  if (channel) {
    void pubsub.publish(TOPICS.CHANNEL_CHANGED_SERVER(channel.serverId), {
      channelChangedInServer: { channelId: id, action: 'deleted' },
    });
  }
  return true;
};
