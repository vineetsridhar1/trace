import {
  SEND_SESSION_MESSAGE_MUTATION,
  generateUUID,
  optimisticallyInsertSessionMessage,
  reconcileOptimisticSessionMessage,
  removeOptimisticSessionMessage,
  useAuthStore,
} from "@trace/client-core";
import { client } from "./urql";
import { uploadFile } from "./upload";

export async function sendSessionFeedback({
  sessionId,
  message,
  imageBlob,
  imagePreviewUrl,
  formatMessage = true,
}: {
  sessionId: string;
  message: string;
  imageBlob: Blob;
  imagePreviewUrl: string;
  formatMessage?: boolean;
}): Promise<void> {
  const file = new File([imageBlob], `trace-feedback-${generateUUID()}.jpg`, {
    type: imageBlob.type || "image/jpeg",
  });
  const orgId = useAuthStore.getState().activeOrgId;
  const imageKey = await uploadFile(file, orgId ?? undefined);
  const text = formatMessage ? formatFeedbackMessage(message) : message.trim();
  const { eventId: tempEventId, clientMutationId } = optimisticallyInsertSessionMessage(
    sessionId,
    text,
    { imageKeys: [imageKey], imagePreviewUrls: [imagePreviewUrl] },
  );

  try {
    const result = await client
      .mutation(SEND_SESSION_MESSAGE_MUTATION, {
        sessionId,
        text,
        attachmentKeys: [imageKey],
        clientMutationId,
      })
      .toPromise();

    if (result.error) {
      throw result.error;
    }

    const realEventId = result.data?.sendSessionMessage?.id;
    if (!realEventId) {
      throw new Error("Failed to send feedback");
    }

    reconcileOptimisticSessionMessage(sessionId, tempEventId, realEventId);
  } catch (error) {
    removeOptimisticSessionMessage(sessionId, tempEventId);
    throw error;
  }
}

function formatFeedbackMessage(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) return "Feedback screenshot";
  return `Feedback:\n\n${trimmed}`;
}
