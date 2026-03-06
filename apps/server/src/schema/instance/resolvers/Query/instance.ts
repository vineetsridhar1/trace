import type { QueryResolvers } from './../../../types.generated';
import { requireAuth } from '../../../../lib/requireAuth';
import { getInstanceById } from '../../../../services/instanceService';
import { authorizedSessions } from '../Mutation/connectToInstance';

export const instance: NonNullable<QueryResolvers['instance']> = async (_parent, { id }, ctx) => {
  const user = requireAuth(ctx);
  const inst = await getInstanceById(id);
  if (!inst) return null;
  if (inst.userId !== user.id && !authorizedSessions.has(`${user.id}:${inst.id}`)) {
    return null;
  }
  return inst;
};
