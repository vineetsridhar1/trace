import type { MutationResolvers } from './../../../types.generated';
import prisma from '../../../../lib/prisma';
import { updateMessageStatus as updateStatus, getMessageByIdForFeed } from '../../../../services/messageService';
import { pubsub, TOPICS } from '../../../../services/pubsub';
import { syncTicketWithMessageStatus } from '../../../../services/ticketService';
import { GraphQLError } from 'graphql';

export const setTicketDependencies: NonNullable<MutationResolvers['setTicketDependencies']> = async (_parent, { channelId, messageId, dependsOnMessageIds, runConfig }, _ctx) => {
  // Delete existing deps for this message (idempotent replace)
  await prisma.ticketDependency.deleteMany({
    where: { ticketMessageId: messageId },
  });

  // Create new dependency rows
  if (dependsOnMessageIds.length > 0) {
    await prisma.ticketDependency.createMany({
      data: dependsOnMessageIds.map((depId: string) => ({
        ticketMessageId: messageId,
        dependsOnMessageId: depId,
      })),
    });
  }

  // Save the queued run config on the message
  await prisma.message.update({
    where: { id: messageId },
    data: { queuedRunConfig: runConfig as object },
  });

  // Update message status to queued
  await updateStatus(messageId, 'queued');
  const message = await getMessageByIdForFeed(messageId);
  if (!message) {
    throw new GraphQLError('Message not found after update', { extensions: { code: 'NOT_FOUND' } });
  }

  // Publish message update via subscription
  pubsub.publish(TOPICS.MESSAGE_UPSERTED(channelId), {
    messageUpserted: message,
  });

  // Sync ticket column
  void syncTicketWithMessageStatus(messageId, channelId, 'queued');

  return message;
};
