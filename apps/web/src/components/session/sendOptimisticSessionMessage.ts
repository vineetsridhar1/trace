import {
  optimisticallyInsertSessionMessage,
  reconcileOptimisticSessionMessage,
  removeOptimisticSessionMessage,
  SEND_SESSION_MESSAGE_MUTATION,
} from "@trace/client-core";
import { client } from "../../lib/urql";
import type { InteractionMode } from "./interactionModes";

export async function sendOptimisticSessionMessage({
  sessionId,
  text,
  imageKeys,
  imagePreviewUrls,
  interactionMode,
  deliveryStatus,
}: {
  sessionId: string;
  text: string;
  imageKeys?: string[];
  imagePreviewUrls?: string[];
  interactionMode?: InteractionMode;
  deliveryStatus?: "pending_runtime";
}): Promise<void> {
  const { eventId, clientMutationId } = optimisticallyInsertSessionMessage(sessionId, text, {
    imageKeys,
    imagePreviewUrls,
    deliveryStatus,
  });

  try {
    const result = await client
      .mutation(SEND_SESSION_MESSAGE_MUTATION, {
        sessionId,
        text,
        attachmentKeys: imageKeys?.length ? imageKeys : undefined,
        interactionMode,
        clientMutationId,
      })
      .toPromise();

    if (result.error) throw result.error;
    const realEventId = result.data?.sendSessionMessage?.id;
    if (!realEventId) throw new Error("Failed to send message");
    reconcileOptimisticSessionMessage(sessionId, eventId, realEventId);
  } catch (error) {
    removeOptimisticSessionMessage(sessionId, eventId);
    throw error;
  }
}
