import type { MutationResolvers } from './../../../types.generated';
import { releaseWorkspace, updateWorkspaceStatus, getWorkspaceByIdForFeed } from '../../../../services/workspaceService';
import { pubsub, TOPICS } from '../../../../services/pubsub';
import { syncTicketWithWorkspaceStatus } from '../../../../services/ticketService';
import { requireAuth } from '../../../../lib/requireAuth';
import { GraphQLError } from 'graphql';

const HANDOFF_ALLOWED_STATUSES = new Set(['in_progress', 'needs_input', 'completed', 'creation']);

export const handoffWorkspace: NonNullable<MutationResolvers['handoffWorkspace']> = async (_parent, { channelId, workspaceId }, ctx) => {
  const user = requireAuth(ctx);

  const current = await getWorkspaceByIdForFeed(workspaceId);
  if (!current || current.channelId !== channelId) {
    throw new GraphQLError('Workspace not found', { extensions: { code: 'NOT_FOUND' } });
  }

  if (current.userId !== user.id) {
    throw new GraphQLError('Only the current owner can hand off a workspace', {
      extensions: { code: 'FORBIDDEN' },
    });
  }

  if (!HANDOFF_ALLOWED_STATUSES.has(current.status)) {
    throw new GraphQLError(
      `Cannot hand off workspace in status "${current.status}". Allowed: ${[...HANDOFF_ALLOWED_STATUSES].join(', ')}`,
      { extensions: { code: 'BAD_USER_INPUT' } },
    );
  }

  await releaseWorkspace(workspaceId);
  await updateWorkspaceStatus(workspaceId, 'pending');

  const workspace = await getWorkspaceByIdForFeed(workspaceId);
  if (!workspace) {
    throw new GraphQLError('Workspace not found after handoff', { extensions: { code: 'NOT_FOUND' } });
  }

  pubsub.publish(TOPICS.WORKSPACE_UPSERTED(channelId), {
    workspaceUpserted: workspace,
  });

  void syncTicketWithWorkspaceStatus(workspaceId, channelId, 'pending');

  return workspace;
};
