import type { MutationResolvers } from './../../../types.generated';
import prisma from '../../../../lib/prisma';
import { pubsub, TOPICS } from '../../../../services/pubsub';
import { requireAuth } from '../../../../lib/requireAuth';

export const requestWorkspaceRun: NonNullable<MutationResolvers['requestWorkspaceRun']> = async (_parent, { channelId, workspaceId, runConfig }, ctx) => {
  requireAuth(ctx);

  // Verify workspace exists and is in a valid state for a follow-up run
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, status: true, channelId: true },
  });

  if (!workspace) {
    throw new Error(`Workspace ${workspaceId} not found`);
  }

  if (workspace.status === 'in_progress' || workspace.status === 'merged') {
    throw new Error(`Workspace ${workspaceId} cannot accept runs in status: ${workspace.status}`);
  }

  pubsub.publish(TOPICS.TICKET_READY_TO_RUN(channelId), {
    ticketReadyToRun: {
      channelId,
      workspaceId,
      runConfig,
    },
  });

  return true;
};
