import { useCallback } from 'react';
import { gql } from '@apollo/client';
import type { KanbanColumn } from '../types';
import { useBoardLazyQuery, useMoveTicketMutation } from './__generated__/useKanban.generated';
import { useKanbanStore } from '../stores/kanbanStore';

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
        workspaceId
        columnId
        title
        description
        solutionApproach
        status
        metadata
        sortOrder
        createdAt
        updatedAt
        workspace {
          id
          branch
          prUrl
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
      workspaceId
      columnId
      title
      sortOrder
    }
  }
`;

export function useKanbanSync() {
  const [executeBoard] = useBoardLazyQuery();
  const [executeMoveTicket] = useMoveTicketMutation();

  const fetchBoard = useCallback(async (channelId: string) => {
    useKanbanStore.getState().setLoading(true);
    try {
      const { data } = await executeBoard({
        variables: { channelId },
      });
      if (!data) return;
      useKanbanStore.getState().setColumns(data.board as KanbanColumn[]);
    } catch {
      console.error('Failed to fetch kanban board');
    } finally {
      useKanbanStore.getState().setLoading(false);
    }
  }, [executeBoard]);

  const moveTicket = useCallback(
    async (channelId: string, ticketId: string, columnId: string, sortOrder: number) => {
      useKanbanStore.getState().moveTicketOptimistic(ticketId, columnId, sortOrder);

      try {
        await executeMoveTicket({ variables: { ticketId, columnId, sortOrder } });
      } catch {
        void fetchBoard(channelId);
      }
    },
    [executeMoveTicket, fetchBoard],
  );

  return { fetchBoard, moveTicket };
}
