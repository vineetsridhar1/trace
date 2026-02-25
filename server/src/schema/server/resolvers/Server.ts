import type { ServerResolvers } from './../../types.generated';
import prisma from '../../../lib/prisma';

export const Server: ServerResolvers = {
  channels: async (parent, _arg, _ctx) => {
    return prisma.channel.findMany({
      where: { serverId: parent.id },
      orderBy: { createdAt: 'asc' },
    });
  },
};
