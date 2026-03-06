import type { MutationResolvers } from './../../../types.generated';
import { appendPromptToWorkspaceSession, getWorkspaceByIdForFeed } from '../../../../services/workspaceService';
import { pubsub, TOPICS } from '../../../../services/pubsub';
import { requireAuth } from '../../../../lib/requireAuth';
import { GraphQLError } from 'graphql';

const ACTIVE_STATUSES = new Set(['creation', 'in_progress', 'needs_input']);

export const appendPrompt: NonNullable<MutationResolvers['appendPrompt']> = async (_parent, { channelId, workspaceId, text, attachmentIds, createNewSession, sessionId }, ctx) => {
  const user = requireAuth(ctx);

  // Check workspace lock before appending
  const current = await getWorkspaceByIdForFeed(workspaceId);
  if (current && ACTIVE_STATUSES.has(current.status) && current.userId && current.userId !== user.id) {
    throw new GraphQLError('Workspace is locked by another user', {
      extensions: { code: 'FORBIDDEN' },
    });
  }

  const created = await appendPromptToWorkspaceSession(
    channelId,
    workspaceId,
    text.trim(),
    attachmentIds ?? undefined,
    createNewSession ?? undefined,
    sessionId ?? undefined,
  );

  if (!created) {
    throw new GraphQLError('Workspace or session not found', { extensions: { code: 'NOT_FOUND' } });
  }

  pubsub.publish(TOPICS.WORKSPACE_UPSERTED(channelId), {
    workspaceUpserted: created.workspace,
  });
  pubsub.publish(TOPICS.SESSION_EVENT_CREATED(channelId), {
    sessionEventCreated: {
      channelId,
      workspaceId: created.workspace.id,
      sessionId: created.session.id,
      event: created.event,
    },
  });

  return created;
};
