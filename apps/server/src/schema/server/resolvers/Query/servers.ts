import type { QueryResolvers } from './../../../types.generated';
import { listServers } from '../../../../services/serverService';

export const servers: NonNullable<QueryResolvers['servers']> = async (_parent, _arg, _ctx) => {
  return listServers();
};
