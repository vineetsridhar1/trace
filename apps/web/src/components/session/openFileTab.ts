/** A file, diff, or attachment the user has opened as a workspace tab. */
export interface OpenFileTab {
  filePath: string;
  fileName: string;
  lineNumber?: number;
  isDiff?: boolean;
  diffStatus?: string;
  isDraftAttachment?: boolean;
  attachmentSessionId?: string;
  attachmentId?: string;
  isUploadedAttachment?: boolean;
  attachmentKey?: string;
}
