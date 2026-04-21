import { useCallback, useState } from "react";
import {
  optimisticallyInsertSessionMessage,
  PLAN_PREFIX,
  QUEUE_SESSION_MESSAGE_MUTATION,
  reconcileOptimisticSessionMessage,
  removeOptimisticSessionMessage,
  SEND_SESSION_MESSAGE_MUTATION,
} from "@trace/client-core";
import { haptic } from "@/lib/haptics";
import { getClient } from "@/lib/urql";

export type ComposerMode = "code" | "plan" | "ask";

const ASK_PREFIX =
  "<trace-internal>\nDo NOT modify any files. Only read files and answer questions. Do not use Edit, Write, or NotebookEdit tools. This is read-only/ask mode.\n</trace-internal>\n\n";

function wrapPrompt(mode: ComposerMode, text: string): string {
  if (mode === "plan") return `${PLAN_PREFIX}\n\n${text}`;
  if (mode === "ask") return `${ASK_PREFIX}${text}`;
  return text;
}

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
      try {
        if (isActive) {
          const result = await getClient()
            .mutation(QUEUE_SESSION_MESSAGE_MUTATION, {
              sessionId,
              text: wrapped,
              interactionMode,
            })
            .toPromise();
          if (result.error) throw result.error;
          onSuccess();
          return;
        }
        const { eventId, clientMutationId } = optimisticallyInsertSessionMessage(
          sessionId,
          wrapped,
        );
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
          onSuccess();
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
