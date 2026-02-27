import type { QueryResolvers } from './../../../types.generated';
import { getEventsByWorkspace } from '../../../../services/workspaceService';

export const workspaceEvents: NonNullable<QueryResolvers['workspaceEvents']> = async (_parent, { workspaceId, limit, offset, after }, _ctx) => {
  return getEventsByWorkspace(workspaceId, {
    limit: limit ?? undefined,
    offset: offset ?? undefined,
    after: after ?? undefined,
  });
};
