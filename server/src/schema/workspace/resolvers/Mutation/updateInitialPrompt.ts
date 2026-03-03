import type { MutationResolvers } from './../../../types.generated';
import { updateInitialPrompt as updatePrompt } from '../../../../services/workspaceService';
import { pubsub, TOPICS } from '../../../../services/pubsub';
import { GraphQLError } from 'graphql';
import { createTicketForWorkspace } from '../../../../services/ticketService';
import { getChannel } from '../../../../services/channelService';

export const updateInitialPrompt: NonNullable<MutationResolvers['updateInitialPrompt']> = async (
  _parent,
  { channelId, workspaceId, text, attachmentIds },
  _ctx
) => {
  const trimmedText = text.trim();
  const result = await updatePrompt(channelId, workspaceId, trimmedText, attachmentIds ?? undefined);

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

  // Fire-and-forget: create kanban ticket now that the user has written a real prompt
  if (trimmedText) {
    void (async () => {
      const channel = await getChannel(channelId);
      void createTicketForWorkspace(
        workspaceId,
        channelId,
        trimmedText,
        channel?.name ?? 'general',
      );
    })();
  }

  return result;
};
