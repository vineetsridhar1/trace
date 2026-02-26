import type { MutationResolvers } from './../../../types.generated';
import { createUserMessage } from '../../../../services/messageService';
import { getChannel } from '../../../../services/channelService';
import { pubsub, TOPICS } from '../../../../services/pubsub';
import { createTicketForMessage } from '../../../../services/ticketService';

export const createMessage: NonNullable<MutationResolvers['createMessage']> = async (_parent, { channelId, text, attachmentIds }, _ctx) => {
  const created = await createUserMessage(channelId, text.trim(), attachmentIds ?? undefined);

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

  // Fire-and-forget: create a kanban ticket
  const channel = await getChannel(channelId);
  void createTicketForMessage(
    created.message.id,
    channelId,
    text.trim(),
    channel?.name ?? 'general',
  );

  return created;
};
