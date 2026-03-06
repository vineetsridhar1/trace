import type { MutationResolvers } from './../../../types.generated';
import { createColumn as createColumnService } from '../../../../services/ticketService';

export const createColumn: NonNullable<MutationResolvers['createColumn']> = async (_parent, { channelId, name, slug, color }, _ctx) => {
  return createColumnService(channelId, name, slug, color ?? undefined);
};
