import { useState, useCallback } from 'react';
import { gql } from '@apollo/client';
import { getServerUrl } from '../types';
import { useUploadAttachmentMutation } from './__generated__/useImageAttachments.generated';

const GQL_UPLOAD_ATTACHMENT = gql`
  mutation UploadAttachment($data: String!, $filename: String!, $contentType: String!) {
    uploadAttachment(data: $data, filename: $filename, contentType: $contentType) {
      id
      key
      filename
      contentType
      byteSize
      url
      localPath
    }
  }
`;

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
  const [executeUploadAttachment] = useUploadAttachmentMutation();
  const [attachments, setAttachments] = useState<AttachedImage[]>([]);
  const [uploading, setUploading] = useState(false);

  const uploadImage = useCallback(async (file: File): Promise<AttachedImage | null> => {
    const base64 = await readFileAsBase64(file);

    try {
      const { data } = await executeUploadAttachment({
        variables: {
          data: base64,
          filename: file.name || 'pasted-image.png',
          contentType: file.type || 'image/png',
        },
      });

      if (!data?.uploadAttachment) return null;

      const attachment = data.uploadAttachment;

      return {
        id: attachment.id,
        key: attachment.key,
        filename: attachment.filename,
        contentType: attachment.contentType,
        previewUrl: URL.createObjectURL(file),
        serverUrl: `${getServerUrl()}${attachment.url}`,
        localPath: attachment.localPath,
      };
    } catch {
      return null;
    }
  }, [executeUploadAttachment]);

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
  const getFilePaths = useCallback(() => attachments.map((a) => a.serverUrl), [attachments]);

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
