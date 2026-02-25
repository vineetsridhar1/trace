import type { MutationResolvers } from './../../../types.generated';
import { appendPromptToMessageThread } from '../../../../services/messageService';
import { sseManager } from '../../../../services/sseManager';
import { GraphQLError } from 'graphql';

export const appendPrompt: NonNullable<MutationResolvers['appendPrompt']> = async (_parent, { channelId, messageId, text, attachmentIds }, _ctx) => {
  const created = await appendPromptToMessageThread(
    channelId,
    messageId,
    text.trim(),
    attachmentIds ?? undefined,
  );

  if (!created) {
    throw new GraphQLError('Message or thread not found', { extensions: { code: 'NOT_FOUND' } });
  }

  sseManager.broadcastChannel(channelId, 'message-upsert', {
    channelId,
    message: created.message,
  });
  sseManager.broadcastChannel(channelId, 'thread-event-created', {
    channelId,
    messageId: created.message.id,
    threadId: created.thread.id,
    event: created.event,
  });
  sseManager.broadcastChannel(channelId, 'message-update', {
    messageId: created.message.id,
    channelId,
  });
  sseManager.broadcastChannel(channelId, 'new-event', created.event);

  return created;
};
