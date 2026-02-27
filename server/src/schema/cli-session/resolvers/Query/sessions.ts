import type { QueryResolvers } from './../../../types.generated';
import { listCliSessions } from '../../../../services/sessionService';

export const cliSessions: NonNullable<QueryResolvers['cliSessions']> = async (_parent, { status, limit, offset, sort, order }, _ctx) => {
  return listCliSessions({
    status: status ?? undefined,
    limit: limit ?? undefined,
    offset: offset ?? undefined,
    sort: sort ?? undefined,
    order: (order as 'asc' | 'desc') ?? undefined,
  });
};
