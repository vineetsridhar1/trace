import type { MutationResolvers } from './../../../types.generated';
import prisma from '../../../../lib/prisma';
import { updateWorkspaceStatus as updateStatus, getWorkspaceByIdForFeed } from '../../../../services/workspaceService';
import { pubsub, TOPICS } from '../../../../services/pubsub';
import { syncTicketWithMessageStatus } from '../../../../services/ticketService';
import { GraphQLError } from 'graphql';

export const setTicketDependencies: NonNullable<MutationResolvers['setTicketDependencies']> = async (_parent, { channelId, workspaceId, dependsOnWorkspaceIds, runConfig }, _ctx) => {
  // Delete existing deps for this workspace (idempotent replace)
  await prisma.ticketDependency.deleteMany({
    where: { ticketWorkspaceId: workspaceId },
  });

  // Create new dependency rows
  if (dependsOnWorkspaceIds.length > 0) {
    await prisma.ticketDependency.createMany({
      data: dependsOnWorkspaceIds.map((depId: string) => ({
        ticketWorkspaceId: workspaceId,
        dependsOnWorkspaceId: depId,
      })),
    });
  }

  // Save the queued run config on the workspace
  await prisma.workspace.update({
    where: { id: workspaceId },
    data: { queuedRunConfig: runConfig as object },
  });

  // Update workspace status to queued
  await updateStatus(workspaceId, 'queued');
  const workspace = await getWorkspaceByIdForFeed(workspaceId);
  if (!workspace) {
    throw new GraphQLError('Workspace not found after update', { extensions: { code: 'NOT_FOUND' } });
  }

  // Publish workspace update via subscription
  pubsub.publish(TOPICS.WORKSPACE_UPSERTED(channelId), {
    workspaceUpserted: workspace,
  });

  // Sync ticket column
  void syncTicketWithMessageStatus(workspaceId, channelId, 'queued');

  return workspace;
};
