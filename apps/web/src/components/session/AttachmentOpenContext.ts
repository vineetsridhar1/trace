import { createContext, useContext } from "react";

export interface DraftAttachmentOpenRequest {
  sessionId: string;
  attachmentId: string;
  fileName: string;
}

export interface UploadedAttachmentOpenRequest {
  attachmentKey: string;
  label: string;
}

export const AttachmentOpenContext = createContext<
  ((request: DraftAttachmentOpenRequest) => void) | null
>(null);

export const UploadedAttachmentOpenContext = createContext<
  ((request: UploadedAttachmentOpenRequest) => void) | null
>(null);

export function useAttachmentOpen(): ((request: DraftAttachmentOpenRequest) => void) | null {
  return useContext(AttachmentOpenContext);
}

export function useUploadedAttachmentOpen(): ((
  request: UploadedAttachmentOpenRequest,
) => void) | null {
  return useContext(UploadedAttachmentOpenContext);
}
