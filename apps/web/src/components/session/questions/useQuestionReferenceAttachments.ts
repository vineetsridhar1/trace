import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { generateUUID } from "@trace/client-core";
import { toast } from "sonner";
import type { FileAttachment } from "../ImageAttachmentBar";
import { MAX_ATTACHMENTS } from "../useAddAttachments";

export const EMPTY_QUESTION_ATTACHMENTS: FileAttachment[] = [];

export function useQuestionReferenceAttachments() {
  const [attachmentsByQuestion, setAttachmentsByQuestion] = useState<
    Record<number, FileAttachment[]>
  >({});
  const attachmentsRef = useRef(attachmentsByQuestion);
  const transferInProgressRef = useRef(false);
  attachmentsRef.current = attachmentsByQuestion;

  useEffect(
    () => () => {
      if (transferInProgressRef.current) return;
      for (const attachments of Object.values(attachmentsRef.current)) {
        for (const attachment of attachments) URL.revokeObjectURL(attachment.previewUrl);
      }
    },
    [],
  );

  const attachments = useMemo(
    () => Object.values(attachmentsByQuestion).flat(),
    [attachmentsByQuestion],
  );
  const referenceValues = useMemo(() => {
    const values: Record<number, string[]> = {};
    for (const [index, questionAttachments] of Object.entries(attachmentsByQuestion)) {
      values[Number(index)] = questionAttachments.map(
        (attachment) => attachment.file.name || "Attachment",
      );
    }
    return values;
  }, [attachmentsByQuestion]);

  const addReferenceFiles = useCallback(
    (questionIndex: number, files: File[]) => {
      const remaining = Math.max(0, MAX_ATTACHMENTS - attachments.length);
      const accepted = files.slice(0, remaining);
      if (accepted.length === 0) {
        toast.error(`You can attach up to ${MAX_ATTACHMENTS} files`);
        return;
      }
      if (accepted.length < files.length) {
        toast.error(`Only ${remaining} more attachment${remaining === 1 ? "" : "s"} allowed`);
      }
      const next = accepted.map((file) => ({
        id: generateUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
        s3Key: null,
        uploading: false,
      }));
      setAttachmentsByQuestion((current) => ({
        ...current,
        [questionIndex]: [...(current[questionIndex] ?? []), ...next],
      }));
    },
    [attachments.length],
  );

  const removeReference = useCallback((questionIndex: number, id: string) => {
    setAttachmentsByQuestion((current) => {
      const attachment = current[questionIndex]?.find((candidate) => candidate.id === id);
      if (attachment) URL.revokeObjectURL(attachment.previewUrl);
      return {
        ...current,
        [questionIndex]: (current[questionIndex] ?? []).filter((candidate) => candidate.id !== id),
      };
    });
  }, []);

  const clearQuestionReferences = useCallback((questionIndex: number) => {
    setAttachmentsByQuestion((current) => {
      for (const attachment of current[questionIndex] ?? []) {
        URL.revokeObjectURL(attachment.previewUrl);
      }
      return { ...current, [questionIndex]: [] };
    });
  }, []);

  const beginTransfer = useCallback(() => {
    transferInProgressRef.current = true;
  }, []);

  const cancelTransfer = useCallback(() => {
    transferInProgressRef.current = false;
  }, []);

  return {
    attachments,
    attachmentsByQuestion,
    referenceValues,
    addReferenceFiles,
    removeReference,
    clearQuestionReferences,
    beginTransfer,
    cancelTransfer,
  };
}
