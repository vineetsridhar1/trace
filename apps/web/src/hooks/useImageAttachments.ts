import { useState, useCallback, useRef } from 'react';
import { gql } from '@apollo/client';
import { getServerUrl } from '@trace/shared-ui';
import { useUploadAttachmentMutation } from './__generated__/useImageAttachments.generated';

const _GQL_UPLOAD_ATTACHMENT = gql`
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
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;
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
      };
    } catch {
      return null;
    }
  }, [executeUploadAttachment]);

  const uploadFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    setUploading(true);
    const results = await Promise.all(files.map(uploadImage));
    const successful = results.filter((r): r is AttachedImage => r !== null);
    setAttachments((prev) => [...prev, ...successful]);
    setUploading(false);
  }, [uploadImage]);

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
      await uploadFiles(imageFiles);
    },
    [uploadFiles],
  );

  const handleFilePick = useCallback(
    async (files: FileList) => {
      const imageFiles: File[] = [];
      for (const file of Array.from(files)) {
        if (file.type.startsWith('image/')) {
          imageFiles.push(file);
        }
      }
      await uploadFiles(imageFiles);
    },
    [uploadFiles],
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

  const getAttachmentIds = useCallback(() => attachmentsRef.current.map((a) => a.id), []);

  return {
    attachments,
    uploading,
    handlePaste,
    handleFilePick,
    removeAttachment,
    clearAttachments,
    getAttachmentIds,
  };
}
