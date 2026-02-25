import { useCallback, useState } from 'react';
import type { KanbanColumn, KanbanTicket } from '../types';
import { graphqlClient } from '../graphql/client';
import { BOARD_QUERY, MOVE_TICKET_MUTATION } from '../graphql/documents/kanban';

export function useKanban() {
  const [columns, setColumns] = useState<KanbanColumn[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchBoard = useCallback(async (channelId: string) => {
    setLoading(true);
    try {
      const result = await graphqlClient.query(BOARD_QUERY, { channelId }, { requestPolicy: 'network-only' }).toPromise();
      if (!result.data) return;
      setColumns(result.data.board as KanbanColumn[]);
    } catch {
      console.error('Failed to fetch kanban board');
    } finally {
      setLoading(false);
    }
  }, []);

  const upsertTicket = useCallback((ticket: KanbanTicket) => {
    setColumns((prev) => {
      // Remove ticket from any column it currently exists in
      const cleaned = prev.map((col) => ({
        ...col,
        tickets: col.tickets.filter((t) => t.id !== ticket.id),
      }));

      // Find the target column - use columnSlug if available, otherwise columnId
      const targetColIndex = cleaned.findIndex(
        (col) => col.id === ticket.columnId || (ticket.columnSlug && col.slug === ticket.columnSlug),
      );

      if (targetColIndex === -1) return prev;

      const updated = [...cleaned];
      const targetCol = { ...updated[targetColIndex] };
      const tickets = [...targetCol.tickets, ticket].sort((a, b) => a.sortOrder - b.sortOrder);
      targetCol.tickets = tickets;
      updated[targetColIndex] = targetCol;
      return updated;
    });
  }, []);

  const moveTicket = useCallback(
    async (channelId: string, ticketId: string, columnId: string, sortOrder: number) => {
      // Optimistic update
      setColumns((prev) => {
        let ticket: KanbanTicket | null = null;
        const cleaned = prev.map((col) => {
          const found = col.tickets.find((t) => t.id === ticketId);
          if (found) ticket = { ...found, columnId, sortOrder };
          return { ...col, tickets: col.tickets.filter((t) => t.id !== ticketId) };
        });

        if (!ticket) return prev;

        return cleaned.map((col) => {
          if (col.id !== columnId) return col;
          const tickets = [...col.tickets, ticket!].sort((a, b) => a.sortOrder - b.sortOrder);
          return { ...col, tickets };
        });
      });

      try {
        await graphqlClient.mutation(MOVE_TICKET_MUTATION, { ticketId, columnId, sortOrder }).toPromise();
      } catch {
        // Revert on failure by refetching
        void fetchBoard(channelId);
      }
    },
    [fetchBoard],
  );

  const clearBoard = useCallback(() => {
    setColumns([]);
  }, []);

  return { columns, loading, fetchBoard, upsertTicket, moveTicket, clearBoard };
}
