import type { MutationResolvers } from './../../../types.generated';
import { addUserMessage, streamAiResponse, autoTitle } from '../../../../services/aiChatService';
import prisma from '../../../../lib/prisma';

export const sendAiChatMessage: NonNullable<MutationResolvers['sendAiChatMessage']> = async (_parent, { chatId, content }) => {
  const message = await addUserMessage(chatId, content);

  // Fire-and-forget: stream AI response
  void streamAiResponse(chatId);

  // Auto-title on first message
  const messageCount = await prisma.aiChatMessage.count({ where: { chatId } });
  if (messageCount === 1) {
    void autoTitle(chatId, content);
  }

  return message;
};
