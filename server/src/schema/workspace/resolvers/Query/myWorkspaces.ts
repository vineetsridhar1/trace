import type { QueryResolvers } from './../../../types.generated';
import { getWorkspacesByUser } from '../../../../services/workspaceService';
import { requireAuth } from '../../../../lib/requireAuth';

export const myWorkspaces: NonNullable<QueryResolvers['myWorkspaces']> = async (_parent, { serverId, excludeStatuses }, ctx) => {
  const user = requireAuth(ctx);
  return getWorkspacesByUser(user.id, serverId, {
    excludeStatuses: excludeStatuses ?? undefined,
  });
};
