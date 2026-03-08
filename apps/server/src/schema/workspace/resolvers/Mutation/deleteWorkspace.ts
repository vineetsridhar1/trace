import type { MutationResolvers } from './../../../types.generated';
import { softDeleteWorkspace, getWorkspaceByIdForFeed } from '../../../../services/workspaceService';
import { pubsub, TOPICS } from '../../../../services/pubsub';
import { GraphQLError } from 'graphql';
import prisma from '../../../../lib/prisma';

export const deleteWorkspace: NonNullable<MutationResolvers['deleteWorkspace']> = async (_parent, { channelId, workspaceId }) => {
  const workspace = await getWorkspaceByIdForFeed(workspaceId);
  if (!workspace || workspace.channelId !== channelId) {
    throw new GraphQLError('Workspace not found', { extensions: { code: 'NOT_FOUND' } });
  }

  await softDeleteWorkspace(workspaceId);
  await prisma.ticket.deleteMany({ where: { workspaceId } });

  pubsub.publish(TOPICS.WORKSPACE_DELETED(channelId), {
    workspaceDeleted: { channelId, workspaceId },
  });

  return true;
};
