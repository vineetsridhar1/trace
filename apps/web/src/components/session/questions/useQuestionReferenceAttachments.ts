import { useCallback } from "react";
import { useDraftsStore } from "../../../stores/drafts";
import type { FileAttachment } from "../ImageAttachmentBar";
import { MAX_ATTACHMENTS, useAddAttachments } from "../useAddAttachments";

export const EMPTY_QUESTION_ATTACHMENTS: FileAttachment[] = [];

export function useQuestionReferenceAttachments({
  sessionId,
  fallbackId,
  currentText,
  setText,
}: {
  sessionId?: string;
  fallbackId: string;
  currentText: string;
  setText: (text: string) => void;
}) {
  const attachments = useDraftsStore((store) =>
    sessionId
      ? (store.drafts[sessionId]?.images ?? EMPTY_QUESTION_ATTACHMENTS)
      : EMPTY_QUESTION_ATTACHMENTS,
  );
  const setDraftImages = useDraftsStore((store) => store.setDraftImages);
  const addAttachments = useAddAttachments(sessionId ?? fallbackId);

  const addReferenceFiles = useCallback(
    (files: File[]) => {
      const accepted = files.slice(0, Math.max(0, MAX_ATTACHMENTS - attachments.length));
      if (accepted.length === 0 || !addAttachments(accepted)) return;
      const entries = currentText.split("\n").filter(Boolean);
      setText([...new Set([...entries, ...accepted.map((file) => file.name)])].join("\n"));
    },
    [addAttachments, attachments.length, currentText, setText],
  );

  const removeReference = useCallback(
    (id: string) => {
      if (!sessionId) return;
      const attachment = attachments.find((candidate) => candidate.id === id);
      setDraftImages(sessionId, (current) => current.filter((candidate) => candidate.id !== id));
      if (!attachment) return;
      URL.revokeObjectURL(attachment.previewUrl);
      setText(
        currentText
          .split("\n")
          .filter((entry) => entry && entry !== attachment.file.name)
          .join("\n"),
      );
    },
    [attachments, currentText, sessionId, setDraftImages, setText],
  );

  return { attachments, addReferenceFiles, removeReference };
}
