import { GraphQLError } from 'graphql';
import type { MutationResolvers } from './../../../types.generated';
import { requireAuth } from '../../../../lib/requireAuth';
import { getInstanceById, verifyInstancePassword } from '../../../../services/instanceService';
import prisma from '../../../../lib/prisma';

export const authorizedSessions = new Set<string>();

export const connectToInstance: NonNullable<MutationResolvers['connectToInstance']> = async (_parent, { instanceId, password }, ctx) => {
  const user = requireAuth(ctx);
  const inst = await getInstanceById(instanceId);
  if (!inst) {
    throw new GraphQLError('Instance not found', {
      extensions: { code: 'NOT_FOUND' },
    });
  }

  if (inst.userId !== user.id) {
    const valid = await verifyInstancePassword(instanceId, password ?? null);
    if (!valid) {
      throw new GraphQLError('Invalid password', {
        extensions: { code: 'FORBIDDEN' },
      });
    }
  }

  authorizedSessions.add(`${user.id}:${inst.id}`);

  const channels = await prisma.channel.findMany({
    where: {
      serverId: inst.serverId,
      members: { some: { userId: user.id } },
    },
    orderBy: { createdAt: 'asc' },
    include: { teamLinks: { select: { teamId: true } } },
  });

  return {
    instanceId: inst.id,
    serverId: inst.serverId,
    channels: channels.map((ch) => {
      const { teamLinks, ...rest } = ch;
      return { ...rest, teamIds: teamLinks.map((l) => l.teamId) };
    }),
  };
};
