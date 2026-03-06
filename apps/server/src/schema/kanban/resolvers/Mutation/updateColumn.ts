import type { MutationResolvers } from './../../../types.generated';
import { updateColumn as updateColumnService } from '../../../../services/ticketService';

export const updateColumn: NonNullable<MutationResolvers['updateColumn']> = async (_parent, { columnId, name, color, sortOrder }, _ctx) => {
  const data: { name?: string; color?: string; sortOrder?: number } = {};
  if (name !== undefined && name !== null) data.name = name;
  if (color !== undefined && color !== null) data.color = color;
  if (sortOrder !== undefined && sortOrder !== null) data.sortOrder = sortOrder;
  return updateColumnService(columnId, data);
};
