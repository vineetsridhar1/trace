import type { QueryResolvers } from './../../../types.generated';
import { requireAuth } from '../../../../lib/requireAuth';
import { getInstancesByUserId } from '../../../../services/instanceService';
import { instanceRelay } from '../../../../services/instanceRelay';

export const myInstances: NonNullable<QueryResolvers['myInstances']> = async (_parent, _arg, ctx) => {
  const user = requireAuth(ctx);
  const instances = await getInstancesByUserId(user.id);
  return instances.map((instance) => ({
    ...instance,
    isOnline: instanceRelay.isOnline(instance.id),
  }));
};
