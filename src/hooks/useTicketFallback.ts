import { useCallback, useEffect, useRef, useState } from 'react';
import { useBoardLazyQuery } from './__generated__/useKanban.generated';
import { useKanbanStore } from '../stores/kanbanStore';
import type { KanbanColumn, KanbanTicket } from '../types';

const RETRY_DELAYS = [1000, 2000, 4000, 8000];

/**
 * Retries fetching the board when a ticket is expected but not found in the
 * kanban store. Handles the race condition where ticket creation (AI-generated)
 * hasn't completed when the user opens the Ticket tab.
 *
 * Returns { retriesExhausted, resetRetries } so callers can show a "not found"
 * state instead of loading forever.
 */
export function useTicketFallback(
  selectedWorkspaceId: string | null,
  activeChannelId: string | null,
  ticket: KanbanTicket | null,
): { retriesExhausted: boolean; resetRetries: () => void } {
  const [executeBoard] = useBoardLazyQuery();
  const [retryCount, setRetryCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasTicket = ticket !== null;

  // Reset retries when workspace changes or ticket is found
  useEffect(() => {
    setRetryCount(0);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, [selectedWorkspaceId, hasTicket]);

  useEffect(() => {
    if (!selectedWorkspaceId || !activeChannelId || ticket) return;
    if (retryCount >= RETRY_DELAYS.length) return;

    const delay = RETRY_DELAYS[retryCount];
    timerRef.current = setTimeout(async () => {
      timerRef.current = null;
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
      setRetryCount((prev) => prev + 1);
    }, delay);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [selectedWorkspaceId, activeChannelId, ticket, retryCount, executeBoard]);

  const resetRetries = useCallback(() => {
    setRetryCount(0);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const retriesExhausted = !ticket && retryCount >= RETRY_DELAYS.length;

  return { retriesExhausted, resetRetries };
}
