import type { MutationResolvers } from './../../../types.generated';
import prisma from '../../../../lib/prisma';
import { updateMessageStatus as updateStatus, getMessageByIdForFeed } from '../../../../services/messageService';
import { pubsub, TOPICS } from '../../../../services/pubsub';
import { syncTicketWithMessageStatus } from '../../../../services/ticketService';

export const removeTicketDependency: NonNullable<MutationResolvers['removeTicketDependency']> = async (_parent, { channelId, messageId, dependsOnMessageId }, _ctx) => {
  // Delete the specific dependency
  await prisma.ticketDependency.deleteMany({
    where: {
      ticketMessageId: messageId,
      dependsOnMessageId,
    },
  });

  // Check if any deps remain
  const remaining = await prisma.ticketDependency.count({
    where: { ticketMessageId: messageId },
  });

  // If no deps remain, reset to pending and clear queuedRunConfig
  if (remaining === 0) {
    await prisma.message.update({
      where: { id: messageId },
      data: { queuedRunConfig: null },
    });
    await updateStatus(messageId, 'pending');
    const message = await getMessageByIdForFeed(messageId);
    if (message) {
      pubsub.publish(TOPICS.MESSAGE_UPSERTED(channelId), {
        messageUpserted: message,
      });
      void syncTicketWithMessageStatus(messageId, channelId, 'pending');
    }
  }

  return true;
};
