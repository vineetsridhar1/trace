import { GraphQLError } from 'graphql';
import type { MutationResolvers } from './../../../types.generated';
import { requireAuth } from '../../../../lib/requireAuth';
import { getInstanceById, setInstancePassword as setPassword } from '../../../../services/instanceService';

export const setInstancePassword: NonNullable<MutationResolvers['setInstancePassword']> = async (_parent, { instanceId, password }, ctx) => {
  const user = requireAuth(ctx);
  const inst = await getInstanceById(instanceId);
  if (!inst || inst.userId !== user.id) {
    throw new GraphQLError('Not found or not authorized', {
      extensions: { code: 'FORBIDDEN' },
    });
  }
  await setPassword(instanceId, password ?? null);
  return true;
};
