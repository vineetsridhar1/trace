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
import { getClient } from "@/lib/urql";
import { uploadImage } from "@/lib/upload";
import { useDraftsStore, type ImageAttachment } from "@/stores/drafts";

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

function messageFromError(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err.length > 0) return err;
  return fallback;
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
      const images = useDraftsStore.getState().images[sessionId] ?? [];
      if ((!draft && images.length === 0) || sending) return;
      void haptic.light();
      setSending(true);
      const wrapped = draft ? wrapPrompt(mode, draft) : "";
      const interactionMode = mode === "code" ? undefined : mode;
      // Clear the draft the same frame the message visibly leaves the input —
      // either as it lands in the queue, or as the optimistic bubble appears.
      // `onFailure(draft)` restores it on error.
      try {
        if (isActive) {
          // Queue path: server mutation doesn't accept imageKeys. Match web
          // and submit text only — attachments remain in the draft.
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

        const savedImages: ImageAttachment[] = [...images];
        const savedIds = new Set(savedImages.map((img) => img.id));
        const previewUris = savedImages.map((img) => img.previewUri);

        let imageKeys: string[] = [];
        if (savedImages.length > 0) {
          useDraftsStore
            .getState()
            .setImages(sessionId, (prev) =>
              prev.map((img) => (savedIds.has(img.id) ? { ...img, uploading: true } : img)),
            );
          const orgId = useAuthStore.getState().activeOrgId;
          if (!orgId) throw new Error("No active organization for upload");
          try {
            imageKeys = await Promise.all(
              savedImages.map((img) =>
                uploadImage({
                  base64: img.base64,
                  fileUri: img.fileUri,
                  mimeType: img.mimeType,
                  organizationId: orgId,
                }),
              ),
            );
          } catch (err) {
            useDraftsStore
              .getState()
              .setImages(sessionId, (prev) =>
                prev.map((img) =>
                  savedIds.has(img.id) ? { ...img, uploading: false } : img,
                ),
              );
            throw err;
          }
        }

        const { eventId, clientMutationId } = optimisticallyInsertSessionMessage(
          sessionId,
          wrapped,
          imageKeys.length > 0
            ? { imageKeys, imagePreviewUrls: previewUris }
            : undefined,
        );
        useDraftsStore
          .getState()
          .setImages(sessionId, (prev) => prev.filter((img) => !savedIds.has(img.id)));
        onSuccess();
        try {
          const result = await getClient()
            .mutation<{ sendSessionMessage: { id: string } }>(
              SEND_SESSION_MESSAGE_MUTATION,
              {
                sessionId,
                text: wrapped,
                imageKeys: imageKeys.length > 0 ? imageKeys : undefined,
                interactionMode,
                clientMutationId,
              },
            )
            .toPromise();
          if (result.error) throw result.error;
          const realId = result.data?.sendSessionMessage?.id;
          if (!realId) throw new Error("Send failed: missing event id");
          reconcileOptimisticSessionMessage(sessionId, eventId, realId);
        } catch (err) {
          removeOptimisticSessionMessage(sessionId, eventId);
          // Restore the failed images at the end of the draft, so anything the
          // user added during the in-flight send keeps its original position.
          useDraftsStore.getState().setImages(sessionId, (prev) => [
            ...prev,
            ...savedImages.map((img) => ({ ...img, uploading: false })),
          ]);
          throw err;
        }
      } catch (err) {
        onFailure(draft, messageFromError(err, "Failed to send. Tap to retry."));
      } finally {
        setSending(false);
      }
    },
    [isActive, onFailure, onSuccess, sending, sessionId],
  );

  return { submit, sending };
}
