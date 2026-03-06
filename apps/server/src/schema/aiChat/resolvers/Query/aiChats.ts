import type { QueryResolvers } from './../../../types.generated';
import { listAiChats } from '../../../../services/aiChatService';

export const aiChats: NonNullable<QueryResolvers['aiChats']> = async (_parent, { serverId }) => {
  return listAiChats(serverId);
};
