import type { MutationResolvers } from './../../../types.generated';
import { updateInitialPrompt as updatePrompt } from '../../../../services/workspaceService';
import { pubsub, TOPICS } from '../../../../services/pubsub';
import { GraphQLError } from 'graphql';

export const updateInitialPrompt: NonNullable<MutationResolvers['updateInitialPrompt']> = async (
  _parent,
  { channelId, workspaceId, text },
  _ctx
) => {
  const result = await updatePrompt(channelId, workspaceId, text.trim());

  if (!result) {
    throw new GraphQLError('Workspace, session, or initial prompt event not found', {
      extensions: { code: 'NOT_FOUND' },
    });
  }

  pubsub.publish(TOPICS.WORKSPACE_UPSERTED(channelId), {
    workspaceUpserted: result.workspace,
  });

  pubsub.publish(TOPICS.SESSION_EVENT_UPDATED(channelId), {
    sessionEventUpdated: {
      channelId,
      workspaceId,
      sessionId: result.session.id,
      event: result.event,
    },
  });

  return result;
};
