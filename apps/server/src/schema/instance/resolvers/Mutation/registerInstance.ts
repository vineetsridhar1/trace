import type { MutationResolvers } from './../../../types.generated';
import { requireAuth } from '../../../../lib/requireAuth';
import { upsertInstance } from '../../../../services/instanceService';

export const registerInstance: NonNullable<MutationResolvers['registerInstance']> = async (_parent, { serverId, name }, ctx) => {
  const user = requireAuth(ctx);
  return upsertInstance({ userId: user.id, serverId, name });
};
