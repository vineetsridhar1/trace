import type { MutationResolvers } from './../../../types.generated';
import { softDeleteMessage, getMessageByIdForFeed } from '../../../../services/messageService';
import { sseManager } from '../../../../services/sseManager';
import { GraphQLError } from 'graphql';

export const deleteMessage: NonNullable<MutationResolvers['deleteMessage']> = async (_parent, { channelId, messageId }) => {
  const message = await getMessageByIdForFeed(messageId);
  if (!message || message.channelId !== channelId) {
    throw new GraphQLError('Message not found', { extensions: { code: 'NOT_FOUND' } });
  }

  await softDeleteMessage(messageId);

  sseManager.broadcastChannel(channelId, 'message-deleted', {
    channelId,
    messageId,
  });

  return true;
};
