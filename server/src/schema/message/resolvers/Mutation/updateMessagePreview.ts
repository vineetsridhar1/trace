import type { MutationResolvers } from './../../../types.generated';
import { updateMessagePreviewAndImportance, getMessageByIdForFeed } from '../../../../services/messageService';
import { pubsub, TOPICS } from '../../../../services/pubsub';
import { GraphQLError } from 'graphql';

export const updateMessagePreview: NonNullable<MutationResolvers['updateMessagePreview']> = async (_parent, { channelId, messageId, preview }, _ctx) => {
  await updateMessagePreviewAndImportance(messageId, preview, 'normal');
  const message = await getMessageByIdForFeed(messageId);
  if (!message) {
    throw new GraphQLError('Message not found', { extensions: { code: 'NOT_FOUND' } });
  }

  pubsub.publish(TOPICS.MESSAGE_UPSERTED(channelId), {
    messageUpserted: message,
  });

  return message;
};
