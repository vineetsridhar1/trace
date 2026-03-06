import type { MutationResolvers } from './../../../types.generated';
import { createEmptySession } from '../../../../services/workspaceService';

export const createSession: NonNullable<MutationResolvers['createSession']> = async (_parent, { workspaceId }, _ctx) => {
  return createEmptySession(workspaceId);
};
