import { useCallback, useState } from "react";
import {
  optimisticallyInsertSessionMessage,
  QUEUE_SESSION_MESSAGE_MUTATION,
  reconcileOptimisticSessionMessage,
  removeOptimisticSessionMessage,
  SEND_SESSION_MESSAGE_MUTATION,
  wrapPrompt,
  type InteractionMode,
} from "@trace/client-core";
import { haptic } from "@/lib/haptics";
import { getClient } from "@/lib/urql";

export type ComposerMode = InteractionMode;

interface UseComposerSubmitOptions {
  sessionId: string;
  /** Whether the agent is actively working — send switches to queue. */
  isActive: boolean;
  /** Called with the draft text when send/queue fails so the UI can restore it. */
  onFailure: (draft: string) => void;
  /** Called on success so the UI can clear the draft + error state. */
  onSuccess: () => void;
}

/**
 * Encapsulates the send-vs-queue fork, optimistic-event insert, and rollback
 * plumbing the composer needs. Kept as a hook so `SessionInputComposer.tsx`
 * stays focused on UI and under its 200-line budget.
 */
export function useComposerSubmit({
  sessionId,
  isActive,
  onFailure,
  onSuccess,
}: UseComposerSubmitOptions) {
  const [sending, setSending] = useState(false);

  const submit = useCallback(
    async (draft: string, mode: ComposerMode) => {
      if (!draft || sending) return;
      void haptic.light();
      setSending(true);
      const wrapped = wrapPrompt(mode, draft);
      const interactionMode = mode === "code" ? undefined : mode;
      // Clear the input the same frame the message visibly leaves it — for
      // the inactive path, that's right after the optimistic event is inserted
      // into the stream; for the queue path, the user expects the draft to
      // empty as soon as they tap. Either way we restore the draft on failure.
      try {
        if (isActive) {
          onSuccess();
          const result = await getClient()
            .mutation(QUEUE_SESSION_MESSAGE_MUTATION, {
              sessionId,
              text: wrapped,
              interactionMode,
            })
            .toPromise();
          if (result.error) throw result.error;
          return;
        }
        const { eventId, clientMutationId } = optimisticallyInsertSessionMessage(
          sessionId,
          wrapped,
        );
        onSuccess();
        try {
          const result = await getClient()
            .mutation<{ sendSessionMessage: { id: string } }>(
              SEND_SESSION_MESSAGE_MUTATION,
              { sessionId, text: wrapped, interactionMode, clientMutationId },
            )
            .toPromise();
          if (result.error) throw result.error;
          const realId = result.data?.sendSessionMessage?.id;
          if (!realId) throw new Error("Send failed: missing event id");
          reconcileOptimisticSessionMessage(sessionId, eventId, realId);
        } catch (err) {
          removeOptimisticSessionMessage(sessionId, eventId);
          throw err;
        }
      } catch {
        onFailure(draft);
      } finally {
        setSending(false);
      }
    },
    [isActive, onFailure, onSuccess, sending, sessionId],
  );

  return { submit, sending };
}
