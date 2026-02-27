import type { QueryResolvers } from './../../../types.generated';
import { getWorkspacesByChannel } from '../../../../services/workspaceService';

export const workspaces: NonNullable<QueryResolvers['workspaces']> = async (_parent, { channelId, limit, offset }, _ctx) => {
  return getWorkspacesByChannel(channelId, {
    limit: limit ?? undefined,
    offset: offset ?? undefined,
  });
};
