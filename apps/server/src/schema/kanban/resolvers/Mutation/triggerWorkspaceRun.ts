import type { MutationResolvers } from './../../../types.generated';
import prisma from '../../../../lib/prisma';
import { getWorkspaceByIdForFeed } from '../../../../services/workspaceService';
import { pubsub, TOPICS } from '../../../../services/pubsub';
import { syncTicketWithWorkspaceStatus } from '../../../../services/ticketService';
import { requireAuth } from '../../../../lib/requireAuth';

export const triggerWorkspaceRun: NonNullable<MutationResolvers['triggerWorkspaceRun']> = async (_parent, { channelId, workspaceId, runConfig }, ctx) => {
  requireAuth(ctx);
  // Save the run config
  await prisma.workspace.update({
    where: { id: workspaceId },
    data: { queuedRunConfig: runConfig as object },
  });

  // Atomically transition pending → creation to prevent double-fire
  const { count } = await prisma.workspace.updateMany({
    where: { id: workspaceId, status: 'pending' },
    data: { status: 'creation' },
  });

  if (count === 0) {
    return false;
  }

  // Publish workspace update so other clients see the status change
  const workspace = await getWorkspaceByIdForFeed(workspaceId);
  if (workspace) {
    pubsub.publish(TOPICS.WORKSPACE_UPSERTED(channelId), {
      workspaceUpserted: workspace,
    });
  }

  // Sync ticket column to match the new status
  void syncTicketWithWorkspaceStatus(workspaceId, channelId, 'creation');

  // Publish ready-to-run event — the frontend subscription handler
  // (autoRunQueuedTicket) picks this up and spawns the agent
  pubsub.publish(TOPICS.TICKET_READY_TO_RUN(channelId), {
    ticketReadyToRun: {
      channelId,
      workspaceId,
      runConfig,
    },
  });

  return true;
};
