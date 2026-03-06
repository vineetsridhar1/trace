import type { MutationResolvers } from './../../../types.generated';
import { createAiChat as createAiChatService } from '../../../../services/aiChatService';

export const createAiChat: NonNullable<MutationResolvers['createAiChat']> = async (_parent, { serverId, channelId, title }) => {
  return createAiChatService(serverId, channelId, title);
};
