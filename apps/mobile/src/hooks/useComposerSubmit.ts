import { useCallback, useState } from "react";
import {
  optimisticallyInsertSessionMessage,
  QUEUE_SESSION_MESSAGE_MUTATION,
  reconcileOptimisticSessionMessage,
  removeOptimisticSessionMessage,
  SEND_SESSION_MESSAGE_MUTATION,
  useAuthStore,
  wrapPrompt,
  type InteractionMode,
} from "@trace/client-core";
import { haptic } from "@/lib/haptics";
import { userFacingError } from "@/lib/requestError";
import { getClient, recreateClient } from "@/lib/urql";
import { uploadFile } from "@/lib/upload";
import { useDraftsStore, type FileAttachment } from "@/stores/drafts";

export type ComposerMode = InteractionMode;

interface UseComposerSubmitOptions {
  sessionId: string;
  /** Whether the agent is actively working — send switches to queue. */
  isActive: boolean;
  /** Called with the draft text + a human error message when send/queue fails. */
  onFailure: (draft: string, message: string) => void;
  /** Called on success so the UI can clear the draft + error state. */
  onSuccess: () => void;
}

export function useComposerSubmit({
  sessionId,
  isActive,
  onFailure,
  onSuccess,
}: UseComposerSubmitOptions) {
  const [sending, setSending] = useState(false);

  const submit = useCallback(
    async (draft: string, mode: ComposerMode) => {
      const attachments = useDraftsStore.getState().attachments[sessionId] ?? [];
      if ((!draft && attachments.length === 0) || sending) return;
      void haptic.light();
      setSending(true);
      const wrapped = !draft ? "" : draft.startsWith("/") ? draft : wrapPrompt(mode, draft);
      const interactionMode = mode === "code" ? undefined : mode;
      // Clear the draft the same frame the message visibly leaves the input —
      // either as it lands in the queue, or as the optimistic bubble appears.
      // `onFailure(draft)` restores it on error.
      try {
        const savedAttachments: FileAttachment[] = [...attachments];
        const savedIds = new Set(savedAttachments.map((attachment) => attachment.id));
        const previewUris = savedAttachments.map((attachment) => attachment.previewUri ?? "");

        let attachmentKeys: string[] = [];
        if (savedAttachments.length > 0) {
          useDraftsStore
            .getState()
            .setAttachments(sessionId, (prev) =>
              prev.map((attachment) =>
                savedIds.has(attachment.id) ? { ...attachment, uploading: true } : attachment,
              ),
            );
          const orgId = useAuthStore.getState().activeOrgId;
          if (!orgId) throw new Error("No active organization for upload");
          try {
            attachmentKeys = await Promise.all(
              savedAttachments.map((attachment) =>
                uploadFile({
                  base64: attachment.base64,
                  fileUri: attachment.fileUri,
                  filename: attachment.filename,
                  mimeType: attachment.mimeType,
                  size: attachment.size,
                  organizationId: orgId,
                }),
              ),
            );
          } catch (err) {
            useDraftsStore
              .getState()
              .setAttachments(sessionId, (prev) =>
                prev.map((attachment) =>
                  savedIds.has(attachment.id) ? { ...attachment, uploading: false } : attachment,
                ),
              );
            throw err;
          }
        }

        if (isActive) {
          const result = await getClient()
            .mutation(QUEUE_SESSION_MESSAGE_MUTATION, {
              sessionId,
              text: wrapped,
              attachmentKeys: attachmentKeys.length > 0 ? attachmentKeys : undefined,
              interactionMode,
          })
            .toPromise();
          if (result.error) throw result.error;
          // Queue updates are ordinarily applied by queued_message_added. If
          // the native socket survived a network change in a stale state, this
          // successful mutation is the earliest reliable recovery point: a
          // fresh subscription triggers the normal reconnect catch-up query.
          recreateClient();
          useDraftsStore
            .getState()
            .setAttachments(sessionId, (prev) =>
              prev.filter((attachment) => !savedIds.has(attachment.id)),
            );
          onSuccess();
          return;
        }

        const { eventId, clientMutationId } = optimisticallyInsertSessionMessage(
          sessionId,
          wrapped,
          attachmentKeys.length > 0
            ? { imageKeys: attachmentKeys, imagePreviewUrls: previewUris }
            : undefined,
        );
        useDraftsStore
          .getState()
          .setAttachments(sessionId, (prev) =>
            prev.filter((attachment) => !savedIds.has(attachment.id)),
          );
        onSuccess();
        try {
          const result = await getClient()
            .mutation<{ sendSessionMessage: { id: string } }>(SEND_SESSION_MESSAGE_MUTATION, {
              sessionId,
              text: wrapped,
              attachmentKeys: attachmentKeys.length > 0 ? attachmentKeys : undefined,
              interactionMode,
              clientMutationId,
            })
            .toPromise();
          if (result.error) throw result.error;
          const realId = result.data?.sendSessionMessage?.id;
          if (!realId) throw new Error("Send failed: missing event id");
          reconcileOptimisticSessionMessage(sessionId, eventId, realId);
        } catch (err) {
          removeOptimisticSessionMessage(sessionId, eventId);
          // Restore failed attachments at the end of the draft, so anything the
          // user added during the in-flight send keeps its original position.
          useDraftsStore
            .getState()
            .setAttachments(sessionId, (prev) => [
              ...prev,
              ...savedAttachments.map((attachment) => ({ ...attachment, uploading: false })),
            ]);
          throw err;
        }
      } catch (err) {
        useDraftsStore
          .getState()
          .setAttachments(sessionId, (prev) =>
            prev.map((attachment) =>
              attachment.uploading ? { ...attachment, uploading: false } : attachment,
            ),
          );
        onFailure(draft, userFacingError(err, "Failed to send. Tap to retry."));
      } finally {
        setSending(false);
      }
    },
    [isActive, onFailure, onSuccess, sending, sessionId],
  );

  return { submit, sending };
}
