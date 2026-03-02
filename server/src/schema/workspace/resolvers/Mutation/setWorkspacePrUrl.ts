import type { MutationResolvers } from './../../../types.generated';
import { requireAuth } from '../../../../lib/requireAuth';
import prisma from '../../../../lib/prisma';
import { GraphQLError } from 'graphql';

export const setWorkspacePrUrl: NonNullable<MutationResolvers['setWorkspacePrUrl']> = async (_parent, { channelId, workspaceId, prUrl }, ctx) => {
  requireAuth(ctx);

  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { id: true, channelId: true, prUrl: true } });
  if (!workspace || workspace.channelId !== channelId) {
    throw new GraphQLError('Workspace not found', { extensions: { code: 'NOT_FOUND' } });
  }

  if (workspace.prUrl !== prUrl) {
    await prisma.workspace.update({ where: { id: workspaceId }, data: { prUrl } });
  }

  return true;
};
