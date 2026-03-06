import type { MutationResolvers } from './../../../types.generated';
import { deleteAiChat as deleteAiChatService } from '../../../../services/aiChatService';

export const deleteAiChat: NonNullable<MutationResolvers['deleteAiChat']> = async (_parent, { id }) => {
  await deleteAiChatService(id);
  return true;
};
