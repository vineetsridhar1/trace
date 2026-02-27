import type { MutationResolvers } from './../../../types.generated';
import prisma from '../../../../lib/prisma';

export const updateQueuedRunConfig: NonNullable<MutationResolvers['updateQueuedRunConfig']> = async (_parent, { workspaceId, runConfig }, _ctx) => {
  await prisma.workspace.update({
    where: { id: workspaceId },
    data: { queuedRunConfig: runConfig as object },
  });

  return true;
};
