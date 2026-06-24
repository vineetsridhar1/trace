import { useCallback } from "react";
import { toast } from "sonner";
import { generateUUID } from "@trace/client-core";
import { useDraftsStore } from "../../stores/drafts";
import type { FileAttachment } from "./ImageAttachmentBar";
import type { ChatEditorPasteFilesOptions } from "../chat/ChatEditor";

export const MAX_ATTACHMENTS = 5;

export function useAddAttachments(sessionId: string) {
  const setDraftImages = useDraftsStore((s) => s.setDraftImages);

  return useCallback(
    (files: File[], options?: ChatEditorPasteFilesOptions) => {
      if (files.length === 0) return false;

      let added = false;
      let rejectedForLimit = false;
      let remainingSlots = 0;

      setDraftImages(sessionId, (prev) => {
        const remaining = MAX_ATTACHMENTS - prev.length;
        remainingSlots = remaining;
        if (remaining <= 0) {
          rejectedForLimit = true;
          return prev;
        }

        const newAttachments: FileAttachment[] = files.slice(0, remaining).map((file) => ({
          id: generateUUID(),
          file,
          previewUrl: URL.createObjectURL(file),
          s3Key: null,
          uploading: false,
        }));
        added = newAttachments.length > 0;
        return [...prev, ...newAttachments];
      });

      if (!options?.fallbackToEditor) {
        if (rejectedForLimit) {
          toast.error(`You can attach up to ${MAX_ATTACHMENTS} files`);
        } else if (files.length > remainingSlots) {
          toast.error(
            `Only ${remainingSlots} more attachment${remainingSlots === 1 ? "" : "s"} allowed`,
          );
        }
      }

      return added;
    },
    [sessionId, setDraftImages],
  );
}
