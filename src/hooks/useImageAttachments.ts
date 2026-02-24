import { useState, useCallback } from 'react';
import { SERVER_URL } from '../types';

export interface AttachedImage {
  id: string;
  key: string;
  filename: string;
  contentType: string;
  previewUrl: string;
  serverUrl: string;
  localPath: string;
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function useImageAttachments() {
  const [attachments, setAttachments] = useState<AttachedImage[]>([]);
  const [uploading, setUploading] = useState(false);

  const uploadImage = useCallback(async (file: File): Promise<AttachedImage | null> => {
    const base64 = await readFileAsBase64(file);

    try {
      const response = await fetch(`${SERVER_URL}/attachments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: base64,
          filename: file.name || 'pasted-image.png',
          contentType: file.type || 'image/png',
        }),
      });

      if (!response.ok) return null;

      const { attachment } = (await response.json()) as {
        attachment: {
          id: string;
          key: string;
          filename: string;
          contentType: string;
          url: string;
          localPath: string;
        };
      };

      return {
        id: attachment.id,
        key: attachment.key,
        filename: attachment.filename,
        contentType: attachment.contentType,
        previewUrl: URL.createObjectURL(file),
        serverUrl: `${SERVER_URL}${attachment.url}`,
        localPath: attachment.localPath,
      };
    } catch {
      return null;
    }
  }, []);

  const handlePaste = useCallback(
    async (event: React.ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;

      const imageFiles: File[] = [];
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }

      if (imageFiles.length === 0) return;

      event.preventDefault();
      setUploading(true);

      const results = await Promise.all(imageFiles.map(uploadImage));
      const successful = results.filter((r): r is AttachedImage => r !== null);
      setAttachments((prev) => [...prev, ...successful]);
      setUploading(false);
    },
    [uploadImage],
  );

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => {
      const removed = prev.find((a) => a.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  const clearAttachments = useCallback(() => {
    setAttachments((prev) => {
      prev.forEach((a) => URL.revokeObjectURL(a.previewUrl));
      return [];
    });
  }, []);

  const getAttachmentIds = useCallback(() => attachments.map((a) => a.id), [attachments]);
  const getFilePaths = useCallback(() => attachments.map((a) => a.localPath), [attachments]);

  return {
    attachments,
    uploading,
    handlePaste,
    removeAttachment,
    clearAttachments,
    getAttachmentIds,
    getFilePaths,
  };
}
