import { useCallback, useState } from "react";
import { generateUUID } from "@trace/client-core";
import { haptic } from "@/lib/haptics";
import type { FileAttachment } from "@/stores/drafts";
import {
  acceptsQuestionReference,
  documentPickerTypes,
  filenameFromReferenceUri,
} from "./question-reference-utils";

export function useQuestionReferencePicker({
  accept,
  onAddAttachments,
}: {
  accept?: string;
  onAddAttachments: (attachments: FileAttachment[]) => void;
}) {
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addAttachments = useCallback(
    (candidates: FileAttachment[]) => {
      const accepted = candidates.filter((attachment) =>
        acceptsQuestionReference(attachment.filename, attachment.mimeType, accept),
      );
      setError(
        accepted.length === candidates.length
          ? null
          : "Choose a file that matches the accepted formats.",
      );
      if (accepted.length > 0) {
        onAddAttachments(accepted);
        void haptic.light();
      }
    },
    [accept, onAddAttachments],
  );

  const pickImages = useCallback(async () => {
    if (picking) return;
    setPicking(true);
    try {
      const picker = await import("expo-image-picker");
      const result = await picker.launchImageLibraryAsync({
        allowsMultipleSelection: true,
        mediaTypes: ["images"],
        quality: 0.9,
        selectionLimit: 5,
      });
      if (result.canceled) return;
      addAttachments(
        result.assets.map((asset) => ({
          id: generateUUID(),
          filename:
            asset.fileName?.trim() ||
            filenameFromReferenceUri(asset.uri, `image-${Date.now()}.jpg`),
          mimeType: asset.mimeType ?? "image/jpeg",
          fileUri: asset.uri,
          previewUri: asset.uri,
          size: asset.fileSize,
          width: asset.width || null,
          height: asset.height || null,
          s3Key: null,
          uploading: false,
        })),
      );
    } catch (pickError) {
      setError(pickError instanceof Error ? pickError.message : "Couldn't open Photo Library.");
      void haptic.error();
    } finally {
      setPicking(false);
    }
  }, [addAttachments, picking]);

  const pickFiles = useCallback(async () => {
    if (picking) return;
    setPicking(true);
    try {
      const picker = await import("expo-document-picker");
      const types = documentPickerTypes(accept);
      const result = await picker.getDocumentAsync({
        type: types.length > 0 ? types : "*/*",
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      addAttachments(
        result.assets.map((asset) => ({
          id: generateUUID(),
          filename: asset.name || filenameFromReferenceUri(asset.uri, "Reference file"),
          mimeType: asset.mimeType || "application/octet-stream",
          fileUri: asset.uri,
          size: asset.size,
          width: null,
          height: null,
          s3Key: null,
          uploading: false,
        })),
      );
    } catch (pickError) {
      setError(pickError instanceof Error ? pickError.message : "Couldn't open Files.");
      void haptic.error();
    } finally {
      setPicking(false);
    }
  }, [accept, addAttachments, picking]);

  return { error, picking, pickFiles, pickImages };
}
