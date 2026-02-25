import type { QueryResolvers } from './../../../types.generated';
import { listSessions } from '../../../../services/sessionService';

export const sessions: NonNullable<QueryResolvers['sessions']> = async (_parent, { status, limit, offset, sort, order }, _ctx) => {
  return listSessions({
    status: status ?? undefined,
    limit: limit ?? undefined,
    offset: offset ?? undefined,
    sort: sort ?? undefined,
    order: (order as 'asc' | 'desc') ?? undefined,
  });
};
