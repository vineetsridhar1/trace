import { createContext, useContext } from "react";

export interface DraftAttachmentOpenRequest {
  sessionId: string;
  attachmentId: string;
  fileName: string;
}

export const AttachmentOpenContext = createContext<
  ((request: DraftAttachmentOpenRequest) => void) | null
>(null);

export function useAttachmentOpen(): ((request: DraftAttachmentOpenRequest) => void) | null {
  return useContext(AttachmentOpenContext);
}
