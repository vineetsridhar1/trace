import type { ServerResolvers } from './../../types.generated';
import prisma from '../../../lib/prisma';

export const Server: ServerResolvers = {
  channels: async (parent, _arg, _ctx) => {
    const channels = await prisma.channel.findMany({
      where: { serverId: parent.id },
      orderBy: { createdAt: 'asc' },
      include: { teamLinks: { select: { teamId: true } } },
    });
    return channels.map((ch) => {
      const { teamLinks, ...rest } = ch;
      return { ...rest, teamIds: teamLinks.map((l) => l.teamId) };
    });
  },
};
