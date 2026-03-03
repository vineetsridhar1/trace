import { useEffect, useRef } from 'react';
import { useBoardLazyQuery } from './__generated__/useKanban.generated';
import { useKanbanStore } from '../stores/kanbanStore';
import type { KanbanColumn, KanbanTicket } from '../types';

const RETRY_DELAYS = [1000, 2000, 4000, 8000];

/**
 * Retries fetching the board when a ticket is expected but not found in the
 * kanban store. Handles the race condition where ticket creation (AI-generated)
 * hasn't completed when the user opens the Ticket tab.
 */
export function useTicketFallback(
  selectedWorkspaceId: string | null,
  activeChannelId: string | null,
  ticket: KanbanTicket | null,
) {
  const [executeBoard] = useBoardLazyQuery();
  const retryCountRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasTicket = ticket !== null;

  useEffect(() => {
    // Reset retries when workspace changes or ticket is found
    retryCountRef.current = 0;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, [selectedWorkspaceId, hasTicket]);

  useEffect(() => {
    if (!selectedWorkspaceId || !activeChannelId || ticket) return;
    if (retryCountRef.current >= RETRY_DELAYS.length) return;

    const delay = RETRY_DELAYS[retryCountRef.current];
    timerRef.current = setTimeout(async () => {
      timerRef.current = null;
      retryCountRef.current += 1;
      try {
        const { data } = await executeBoard({
          variables: { channelId: activeChannelId },
          fetchPolicy: 'network-only',
        });
        if (data) {
          useKanbanStore.getState().setColumns(data.board as KanbanColumn[], activeChannelId);
        }
      } catch {
        // Silently retry on next interval
      }
    }, delay);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [selectedWorkspaceId, activeChannelId, ticket, executeBoard]);
}
