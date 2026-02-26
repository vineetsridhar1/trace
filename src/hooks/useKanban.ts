import { useCallback, useState } from 'react';
import { gql, useApolloClient } from '@apollo/client';
import type { KanbanColumn, KanbanTicket } from '../types';
import { BoardDocument, type BoardQuery, useMoveTicketMutation } from './__generated__/useKanban.generated';

const GQL_BOARD = gql`
  query Board($channelId: ID!) {
    board(channelId: $channelId) {
      id
      channelId
      name
      slug
      color
      sortOrder
      tickets {
        id
        messageId
        columnId
        title
        description
        solutionApproach
        status
        metadata
        sortOrder
        createdAt
        updatedAt
        message {
          id
          branch
          status
          createdAt
          attachments {
            id
            key
            filename
            contentType
            url
          }
        }
      }
    }
  }
`;

const GQL_MOVE_TICKET = gql`
  mutation MoveTicket($ticketId: ID!, $columnId: ID!, $sortOrder: Int) {
    moveTicket(ticketId: $ticketId, columnId: $columnId, sortOrder: $sortOrder) {
      id
      messageId
      columnId
      title
      sortOrder
    }
  }
`;

export function useKanban() {
  const client = useApolloClient();
  const [executeMoveTicket] = useMoveTicketMutation();
  const [columns, setColumns] = useState<KanbanColumn[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchBoard = useCallback(async (channelId: string) => {
    setLoading(true);
    try {
      const { data } = await client.query<BoardQuery>({
        query: BoardDocument,
        variables: { channelId },
      });
      if (!data) return;
      setColumns(data.board as KanbanColumn[]);
    } catch {
      console.error('Failed to fetch kanban board');
    } finally {
      setLoading(false);
    }
  }, [client]);

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
        await executeMoveTicket({ variables: { ticketId, columnId, sortOrder } });
      } catch {
        // Revert on failure by refetching
        void fetchBoard(channelId);
      }
    },
    [executeMoveTicket, fetchBoard],
  );

  const clearBoard = useCallback(() => {
    setColumns([]);
  }, []);

  return { columns, loading, fetchBoard, upsertTicket, moveTicket, clearBoard };
}
