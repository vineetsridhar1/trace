import {
  optimisticallyInsertSessionMessage,
  reconcileOptimisticSessionMessage,
  removeOptimisticSessionMessage,
  SEND_SESSION_MESSAGE_MUTATION,
} from "@trace/client-core";
import type { FileAttachment } from "@/stores/drafts";
import { getClient } from "./urql";
import { uploadFile } from "./upload";

interface SubmitQuestionResponseOptions {
  sessionId: string;
  text: string;
  interactionMode?: "plan";
  attachments: readonly FileAttachment[];
  organizationId: string | null;
  onAttachmentsUploaded?: (attachments: FileAttachment[]) => void;
}

export async function submitQuestionResponse({
  sessionId,
  text,
  interactionMode,
  attachments,
  organizationId,
  onAttachmentsUploaded,
}: SubmitQuestionResponseOptions): Promise<FileAttachment[]> {
  if (attachments.length > 0 && !organizationId) {
    throw new Error("No active organization for upload");
  }

  const uploadedAttachments = await Promise.all(
    attachments.map(async (attachment) => {
      if (attachment.s3Key) return attachment;
      const s3Key = await uploadFile({
        base64: attachment.base64,
        fileUri: attachment.fileUri,
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        size: attachment.size,
        organizationId: organizationId!,
      });
      return { ...attachment, s3Key };
    }),
  );
  const attachmentKeys = uploadedAttachments
    .map((attachment) => attachment.s3Key)
    .filter((key): key is string => Boolean(key));
  onAttachmentsUploaded?.(uploadedAttachments);
  const previewUrls = uploadedAttachments.map((attachment) => attachment.previewUri ?? "");
  const { eventId, clientMutationId } = optimisticallyInsertSessionMessage(
    sessionId,
    text,
    attachmentKeys.length > 0
      ? { imageKeys: attachmentKeys, imagePreviewUrls: previewUrls }
      : undefined,
  );

  try {
    const result = await getClient()
      .mutation<{ sendSessionMessage: { id: string } }>(SEND_SESSION_MESSAGE_MUTATION, {
        sessionId,
        text,
        attachmentKeys: attachmentKeys.length > 0 ? attachmentKeys : undefined,
        interactionMode,
        clientMutationId,
      })
      .toPromise();
    if (result.error) throw result.error;
    const realEventId = result.data?.sendSessionMessage?.id;
    if (!realEventId) throw new Error("Send failed: missing event id");
    reconcileOptimisticSessionMessage(sessionId, eventId, realEventId);
    return uploadedAttachments;
  } catch (error) {
    removeOptimisticSessionMessage(sessionId, eventId);
    throw error;
  }
}
