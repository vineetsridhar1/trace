import type { MutationResolvers } from './../../../types.generated';
import { moveTicket as moveTicketService } from '../../../../services/ticketService';

export const moveTicket: NonNullable<MutationResolvers['moveTicket']> = async (_parent, { ticketId, columnId, sortOrder }, _ctx) => {
  return moveTicketService(ticketId, columnId, sortOrder ?? 0);
};
