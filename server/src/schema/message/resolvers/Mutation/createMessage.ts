import type { MutationResolvers } from './../../../types.generated';
import { createUserMessage } from '../../../../services/messageService';
import { getChannel } from '../../../../services/channelService';
import { sseManager } from '../../../../services/sseManager';
import { createTicketForMessage } from '../../../../services/ticketService';

export const createMessage: NonNullable<MutationResolvers['createMessage']> = async (_parent, { channelId, text, attachmentIds }, _ctx) => {
  const created = await createUserMessage(channelId, text.trim(), attachmentIds ?? undefined);

  sseManager.broadcastChannel(channelId, 'message-created', {
    channelId,
    message: created.message,
  });
  sseManager.broadcastChannel(channelId, 'thread-event-created', {
    channelId,
    messageId: created.message.id,
    threadId: created.thread.id,
    event: created.event,
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
