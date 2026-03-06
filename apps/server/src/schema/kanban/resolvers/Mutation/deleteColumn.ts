import type { MutationResolvers } from './../../../types.generated';
import { deleteColumn as deleteColumnService } from '../../../../services/ticketService';

export const deleteColumn: NonNullable<MutationResolvers['deleteColumn']> = async (_parent, { columnId }, _ctx) => {
  await deleteColumnService(columnId);
  return true;
};
