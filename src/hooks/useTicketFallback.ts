import { useCallback, useEffect, useRef, useState } from 'react';
import { gql } from '@apollo/client';
import { useTicketByWorkspaceIdLazyQuery } from './__generated__/useTicketFallback.generated';
import { useKanbanStore } from '../stores/kanbanStore';
import type { KanbanTicket } from '../types';

const _GQL_TICKET_BY_WORKSPACE_ID = gql`
  query TicketByWorkspaceId($workspaceId: ID!) {
    ticketByWorkspaceId(workspaceId: $workspaceId) {
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
`;

const RETRY_DELAYS = [1000, 2000, 4000, 8000];

/**
 * Fetches a single ticket by workspace ID directly, instead of loading the
 * entire board. Falls back to exponential retry when the ticket hasn't been
 * created yet (AI-generated ticket creation is async).
 *
 * Returns { ticket, retriesExhausted, resetRetries }.
 */
export function useTicketFallback(
  selectedWorkspaceId: string | null,
  activeChannelId: string | null,
): { ticket: KanbanTicket | null; retriesExhausted: boolean; resetRetries: () => void } {
  const [executeQuery] = useTicketByWorkspaceIdLazyQuery();
  const [retryCount, setRetryCount] = useState(0);
  const [queriedTicket, setQueriedTicket] = useState<KanbanTicket | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Also check the kanban store for real-time subscription updates (O(1) lookup)
  const storeTicket = useKanbanStore((s) =>
    selectedWorkspaceId ? (s.workspaceTickets[selectedWorkspaceId] ?? null) : null,
  );

  const ticket = storeTicket ?? queriedTicket;

  // Reset when workspace changes
  useEffect(() => {
    setRetryCount(0);
    setQueriedTicket(null);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, [selectedWorkspaceId]);

  // Fetch ticket on mount and retry with backoff
  useEffect(() => {
    if (!selectedWorkspaceId || !activeChannelId || ticket) return;
    if (retryCount > RETRY_DELAYS.length) return;

    const delay = retryCount === 0 ? 0 : RETRY_DELAYS[retryCount - 1];
    timerRef.current = setTimeout(async () => {
      timerRef.current = null;
      try {
        const { data } = await executeQuery({
          variables: { workspaceId: selectedWorkspaceId },
          fetchPolicy: 'network-only',
        });
        if (data?.ticketByWorkspaceId) {
          const fetched = data.ticketByWorkspaceId as KanbanTicket;
          setQueriedTicket(fetched);
          // Keep board in sync
          useKanbanStore.getState().upsertTicket(fetched, activeChannelId);
        }
      } catch {
        // Silently retry on next interval
      }
      setRetryCount((prev) => prev + 1);
    }, delay);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [selectedWorkspaceId, activeChannelId, ticket, retryCount, executeQuery]);

  const resetRetries = useCallback(() => {
    setRetryCount(0);
    setQueriedTicket(null);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const retriesExhausted = !ticket && retryCount > RETRY_DELAYS.length;

  return { ticket, retriesExhausted, resetRetries };
}
