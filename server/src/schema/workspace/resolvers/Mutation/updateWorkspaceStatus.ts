import type { MutationResolvers } from './../../../types.generated';
import { updateWorkspaceStatus as updateStatus, getWorkspaceByIdForFeed, claimWorkspace } from '../../../../services/workspaceService';
import { pubsub, TOPICS } from '../../../../services/pubsub';
import { syncTicketWithWorkspaceStatus, checkAndTriggerDependents } from '../../../../services/ticketService';
import { requireAuth } from '../../../../lib/requireAuth';
import { GraphQLError } from 'graphql';

const VALID_STATUSES = ['pending', 'in_progress', 'completed', 'creation', 'merged', 'needs_input', 'queued', 'review'];

const STATUS_TRANSITIONS: Record<string, string[]> = {
  pending: ['creation', 'in_progress', 'queued'],
  queued: ['creation', 'in_progress', 'pending'],
  creation: ['in_progress', 'pending'],
  in_progress: ['completed', 'needs_input'],
  needs_input: ['in_progress'],
  completed: ['review', 'merged', 'in_progress'],
  review: ['merged', 'in_progress'],
  merged: [],
};

const ACTIVE_STATUSES = new Set(['creation', 'in_progress', 'needs_input']);

export const updateWorkspaceStatus: NonNullable<MutationResolvers['updateWorkspaceStatus']> = async (_parent, { channelId, workspaceId, status }, ctx) => {
  const user = requireAuth(ctx);

  if (!VALID_STATUSES.includes(status)) {
    throw new GraphQLError(`status must be one of: ${VALID_STATUSES.join(', ')}`, {
      extensions: { code: 'BAD_USER_INPUT' },
    });
  }

  const current = await getWorkspaceByIdForFeed(workspaceId);
  if (!current) {
    throw new GraphQLError('Workspace not found', { extensions: { code: 'NOT_FOUND' } });
  }

  // Enforce workspace locking: if workspace is active and locked to another user, deny
  if (ACTIVE_STATUSES.has(current.status) && current.userId && current.userId !== user.id) {
    throw new GraphQLError('Workspace is locked by another user', {
      extensions: { code: 'FORBIDDEN' },
    });
  }

  const allowed = STATUS_TRANSITIONS[current.status];
  if (allowed && !allowed.includes(status)) {
    throw new GraphQLError(
      `Invalid status transition: ${current.status} → ${status}. Allowed: ${allowed.join(', ') || 'none'}`,
      { extensions: { code: 'BAD_USER_INPUT' } },
    );
  }

  // Claim workspace when transitioning to an active state and no owner yet
  if ((status === 'creation' || status === 'in_progress') && !current.userId) {
    await claimWorkspace(workspaceId, user.id);
  }

  await updateStatus(workspaceId, status);
  const workspace = await getWorkspaceByIdForFeed(workspaceId);
  if (!workspace) {
    throw new GraphQLError('Workspace not found after update', { extensions: { code: 'NOT_FOUND' } });
  }

  pubsub.publish(TOPICS.WORKSPACE_UPSERTED(channelId), {
    workspaceUpserted: workspace,
  });

  void syncTicketWithWorkspaceStatus(workspaceId, channelId, status);

  if (status === 'merged') {
    void checkAndTriggerDependents(workspaceId, channelId);
  }

  return workspace;
};
