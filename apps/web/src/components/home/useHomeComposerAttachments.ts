import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { generateUUID } from "@trace/client-core";
import type { ChatEditorPasteFilesOptions } from "../chat/ChatEditor";
import type { FileAttachment } from "../session/ImageAttachmentBar";
import { MAX_ATTACHMENTS } from "../session/useAddAttachments";

export function useHomeComposerAttachments() {
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;

  useEffect(
    () => () =>
      attachmentsRef.current.forEach((attachment) => URL.revokeObjectURL(attachment.previewUrl)),
    [],
  );

  const addAttachments = useCallback(
    (files: File[], options?: ChatEditorPasteFilesOptions) => {
      if (files.length === 0) return false;
      const remaining = MAX_ATTACHMENTS - attachments.length;
      if (remaining <= 0) {
        if (!options?.fallbackToEditor) {
          toast.error(`You can attach up to ${MAX_ATTACHMENTS} files`);
        }
        return false;
      }

      const added = files.slice(0, remaining).map((file) => ({
        id: generateUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
        s3Key: null,
        uploading: false,
      }));
      setAttachments((current) => [...current, ...added]);
      if (!options?.fallbackToEditor && files.length > remaining) {
        toast.error(`Only ${remaining} more attachment${remaining === 1 ? "" : "s"} allowed`);
      }
      return true;
    },
    [attachments.length],
  );

  const removeAttachment = useCallback((id: string) => {
    setAttachments((current) => {
      const attachment = current.find((item) => item.id === id);
      if (attachment) URL.revokeObjectURL(attachment.previewUrl);
      return current.filter((item) => item.id !== id);
    });
  }, []);

  const setUploading = useCallback((ids: Set<string>, uploading: boolean) => {
    setAttachments((current) =>
      current.map((attachment) =>
        ids.has(attachment.id) ? { ...attachment, uploading } : attachment,
      ),
    );
  }, []);

  const clearAttachments = useCallback(() => {
    setAttachments((current) => {
      current.forEach((attachment) => URL.revokeObjectURL(attachment.previewUrl));
      return [];
    });
  }, []);

  return { attachments, addAttachments, removeAttachment, setUploading, clearAttachments };
}
