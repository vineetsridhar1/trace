import type { MutationResolvers } from './../../../types.generated';
import { appendPromptToMessageThread } from '../../../../services/messageService';
import { pubsub, TOPICS } from '../../../../services/pubsub';
import { GraphQLError } from 'graphql';

export const appendPrompt: NonNullable<MutationResolvers['appendPrompt']> = async (_parent, { channelId, messageId, text, attachmentIds, createNewThread, threadId }, _ctx) => {
  const created = await appendPromptToMessageThread(
    channelId,
    messageId,
    text.trim(),
    attachmentIds ?? undefined,
    createNewThread ?? undefined,
    threadId ?? undefined,
  );

  if (!created) {
    throw new GraphQLError('Message or thread not found', { extensions: { code: 'NOT_FOUND' } });
  }

  pubsub.publish(TOPICS.MESSAGE_UPSERTED(channelId), {
    messageUpserted: created.message,
  });
  pubsub.publish(TOPICS.THREAD_EVENT_CREATED(channelId), {
    threadEventCreated: {
      channelId,
      messageId: created.message.id,
      threadId: created.thread.id,
      event: created.event,
    },
  });

  return created;
};
