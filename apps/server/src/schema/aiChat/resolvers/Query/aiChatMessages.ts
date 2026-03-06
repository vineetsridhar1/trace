import type { QueryResolvers } from './../../../types.generated';
import { getMessages } from '../../../../services/aiChatService';

export const aiChatMessages: NonNullable<QueryResolvers['aiChatMessages']> = async (_parent, { chatId, limit, offset }) => {
  return getMessages(chatId, {
    limit: limit ?? undefined,
    offset: offset ?? undefined,
  });
};
