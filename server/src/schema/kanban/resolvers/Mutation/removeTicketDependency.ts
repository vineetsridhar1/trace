import type { MutationResolvers } from './../../../types.generated';
import prisma from '../../../../lib/prisma';
import { updateWorkspaceStatus as updateStatus, getWorkspaceByIdForFeed } from '../../../../services/workspaceService';
import { pubsub, TOPICS } from '../../../../services/pubsub';
import { syncTicketWithMessageStatus } from '../../../../services/ticketService';

export const removeTicketDependency: NonNullable<MutationResolvers['removeTicketDependency']> = async (_parent, { channelId, workspaceId, dependsOnWorkspaceId }, _ctx) => {
  // Delete the specific dependency
  await prisma.ticketDependency.deleteMany({
    where: {
      ticketWorkspaceId: workspaceId,
      dependsOnWorkspaceId,
    },
  });

  // Check if any deps remain
  const remaining = await prisma.ticketDependency.count({
    where: { ticketWorkspaceId: workspaceId },
  });

  // If no deps remain, reset to pending and clear queuedRunConfig
  if (remaining === 0) {
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { queuedRunConfig: null },
    });
    await updateStatus(workspaceId, 'pending');
    const workspace = await getWorkspaceByIdForFeed(workspaceId);
    if (workspace) {
      pubsub.publish(TOPICS.WORKSPACE_UPSERTED(channelId), {
        workspaceUpserted: workspace,
      });
      void syncTicketWithMessageStatus(workspaceId, channelId, 'pending');
    }
  }

  return true;
};
