import type { AiChatResolvers } from './../../types.generated';

export const AiChat: AiChatResolvers = {
  lastMessage: (parent) => {
    const messages = parent.messages;
    if (!messages || messages.length === 0) return null;
    return messages[0].content;
  },
};
