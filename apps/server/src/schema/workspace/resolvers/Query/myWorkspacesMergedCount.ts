import type { QueryResolvers } from './../../../types.generated';
import { getWorkspacesMergedCountByUser } from '../../../../services/workspaceService';
import { requireAuth } from '../../../../lib/requireAuth';

export const myWorkspacesMergedCount: NonNullable<QueryResolvers['myWorkspacesMergedCount']> = async (_parent, { serverId }, ctx) => {
  const user = requireAuth(ctx);
  return getWorkspacesMergedCountByUser(user.id, serverId);
};
