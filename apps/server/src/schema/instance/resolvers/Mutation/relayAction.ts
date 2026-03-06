import type { MutationResolvers } from './../../../types.generated';
import { requireAuth } from '../../../../lib/requireAuth';
import { getInstanceById } from '../../../../services/instanceService';
import { instanceRelay } from '../../../../services/instanceRelay';
import { authorizedSessions } from './connectToInstance';

export const relayAction: NonNullable<MutationResolvers['relayAction']> = async (_parent, { instanceId, action, params }, ctx) => {
  const user = requireAuth(ctx);
  const inst = await getInstanceById(instanceId);
  if (!inst) {
    return { success: false, error: 'INSTANCE_NOT_FOUND' };
  }

  if (inst.userId !== user.id && !authorizedSessions.has(`${user.id}:${inst.id}`)) {
    return { success: false, error: 'UNAUTHORIZED' };
  }

  if (!instanceRelay.isOnline(instanceId)) {
    return { success: false, error: 'INSTANCE_OFFLINE' };
  }

  try {
    const result = await instanceRelay.sendCommand(instanceId, action, params as Record<string, unknown>);
    return { success: result.success, data: result.data, error: result.error };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'RELAY_ERROR';
    return { success: false, error: message };
  }
};
