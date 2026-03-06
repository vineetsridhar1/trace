import type { QueryResolvers } from './../../../types.generated';
import { getTicketByWorkspaceId } from '../../../../services/ticketService';

export const ticketByWorkspaceId: NonNullable<QueryResolvers['ticketByWorkspaceId']> = async (_parent, { workspaceId }, _ctx) => {
  return getTicketByWorkspaceId(workspaceId);
};
