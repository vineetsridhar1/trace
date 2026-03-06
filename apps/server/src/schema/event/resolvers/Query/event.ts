import type { QueryResolvers } from './../../../types.generated';
import { getEventById } from '../../../../services/eventService';

export const event: NonNullable<QueryResolvers['event']> = async (_parent, { id }, _ctx) => {
  return getEventById(id);
};
