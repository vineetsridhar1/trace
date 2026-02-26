import type { MutationResolvers } from './../../../types.generated';
import { renameAiChat as renameAiChatService } from '../../../../services/aiChatService';

export const renameAiChat: NonNullable<MutationResolvers['renameAiChat']> = async (_parent, { id, title }) => {
  return renameAiChatService(id, title);
};
