import type { KanbanColumnResolvers } from './../../types.generated';
export const KanbanColumn: KanbanColumnResolvers = {
    tickets: ({ tickets }, _arg, _ctx) => {
                        /* KanbanColumn.tickets resolver is required because KanbanColumn.tickets and KanbanColumnMapper.tickets are not compatible */
                        return tickets
                      }
};
