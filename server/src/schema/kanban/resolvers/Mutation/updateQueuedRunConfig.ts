import type { MutationResolvers } from './../../../types.generated';
import prisma from '../../../../lib/prisma';

export const updateQueuedRunConfig: NonNullable<MutationResolvers['updateQueuedRunConfig']> = async (_parent, { messageId, runConfig }, _ctx) => {
  await prisma.message.update({
    where: { id: messageId },
    data: { queuedRunConfig: runConfig as object },
  });

  return true;
};
