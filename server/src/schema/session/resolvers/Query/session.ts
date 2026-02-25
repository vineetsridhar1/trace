import type { QueryResolvers } from './../../../types.generated';
import { getSession } from '../../../../services/sessionService';

export const session: NonNullable<QueryResolvers['session']> = async (_parent, { sessionId }, _ctx) => {
  return getSession(sessionId);
};
