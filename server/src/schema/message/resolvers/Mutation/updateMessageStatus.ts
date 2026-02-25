import type { MutationResolvers } from './../../../types.generated';
import { updateMessageStatus as updateStatus, getMessageByIdForFeed } from '../../../../services/messageService';
import { sseManager } from '../../../../services/sseManager';
import { syncTicketWithMessageStatus } from '../../../../services/ticketService';
import { GraphQLError } from 'graphql';

const VALID_STATUSES = ['pending', 'in_progress', 'completed', 'creation'];

export const updateMessageStatus: NonNullable<MutationResolvers['updateMessageStatus']> = async (_parent, { channelId, messageId, status }, _ctx) => {
  if (!VALID_STATUSES.includes(status)) {
    throw new GraphQLError(`status must be one of: ${VALID_STATUSES.join(', ')}`, {
      extensions: { code: 'BAD_USER_INPUT' },
    });
  }

  await updateStatus(messageId, status);
  const message = await getMessageByIdForFeed(messageId);
  if (!message) {
    throw new GraphQLError('Message not found', { extensions: { code: 'NOT_FOUND' } });
  }

  sseManager.broadcastChannel(channelId, 'message-upsert', {
    channelId,
    message,
  });

  void syncTicketWithMessageStatus(messageId, channelId, status);

  return message;
};
