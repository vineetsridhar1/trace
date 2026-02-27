import type { QueryResolvers } from './../../../types.generated';
import { getSessionsByWorkspace } from '../../../../services/workspaceService';

export const sessions: NonNullable<QueryResolvers['sessions']> = async (_parent, { workspaceId }, _ctx) => {
  return getSessionsByWorkspace(workspaceId);
};
