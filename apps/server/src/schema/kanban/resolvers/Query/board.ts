import type { QueryResolvers } from './../../../types.generated';
import { getBoard } from '../../../../services/ticketService';
import { getStorage } from '../../../../services/storageService';

export const board: NonNullable<QueryResolvers['board']> = async (_parent, { channelId }, _ctx) => {
  const columns = await getBoard(channelId);
  const storage = getStorage();
  return columns.map((col: Awaited<ReturnType<typeof getBoard>>[number]) => ({
    ...col,
    tickets: col.tickets.map((ticket: (typeof col.tickets)[number]) => ({
      ...ticket,
      workspace: ticket.workspace
        ? {
            ...ticket.workspace,
            attachments: ticket.workspace.attachments.map((a: (typeof ticket.workspace.attachments)[number]) => ({
              ...a,
              url: storage.url(a.key),
            })),
          }
        : null,
    })),
  }));
};
