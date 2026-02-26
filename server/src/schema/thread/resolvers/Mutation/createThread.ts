import type { MutationResolvers } from './../../../types.generated';
import { createEmptyThread } from '../../../../services/messageService';

export const createThread: NonNullable<MutationResolvers['createThread']> = async (_parent, { messageId }, _ctx) => {
  return createEmptyThread(messageId);
};
