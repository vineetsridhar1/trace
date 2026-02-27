import type { QueryResolvers } from './../../../types.generated';
import { getCliSession } from '../../../../services/sessionService';

export const cliSession: NonNullable<QueryResolvers['cliSession']> = async (_parent, { sessionId }, _ctx) => {
  return getCliSession(sessionId);
};
