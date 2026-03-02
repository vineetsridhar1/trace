import type { QueryResolvers } from './../../../types.generated';
import { getWorkspaceByIdForFeed } from '../../../../services/workspaceService';

export const workspace: NonNullable<QueryResolvers['workspace']> = async (_parent, { id }, _ctx) => {
  return getWorkspaceByIdForFeed(id);
};
