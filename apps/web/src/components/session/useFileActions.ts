import { useCallback, useState } from "react";
import { useUIStore } from "../../stores/ui";
import type { OpenFileTab } from "./GroupTabStrip";
import type {
  DraftAttachmentOpenRequest,
  UploadedAttachmentOpenRequest,
} from "./AttachmentOpenContext";

export function useFileActions() {
  const setActiveTerminalId = useUIStore(
    (s: { setActiveTerminalId: (id: string | null) => void }) => s.setActiveTerminalId,
  );
  const [openFiles, setOpenFiles] = useState<OpenFileTab[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);

  const handleFileClick = useCallback(
    (filePath: string) => {
      setOpenFiles((prev: OpenFileTab[]) => {
        if (prev.some((f: OpenFileTab) => f.filePath === filePath)) return prev;
        const fileName = filePath.split("/").pop() ?? filePath;
        return [...prev, { filePath, fileName }];
      });
      setActiveFilePath(filePath);
      setActiveTerminalId(null);
    },
    [setActiveTerminalId],
  );

  const handleDraftAttachmentClick = useCallback(
    ({ sessionId, attachmentId, fileName }: DraftAttachmentOpenRequest) => {
      const filePath = `attachment:${sessionId}:${attachmentId}`;
      setOpenFiles((prev: OpenFileTab[]) => {
        if (prev.some((f: OpenFileTab) => f.filePath === filePath)) return prev;
        return [
          ...prev,
          {
            filePath,
            fileName: fileName || "Attachment",
            isDraftAttachment: true,
            attachmentSessionId: sessionId,
            attachmentId,
          },
        ];
      });
      setActiveFilePath(filePath);
      setActiveTerminalId(null);
    },
    [setActiveTerminalId],
  );

  const handleUploadedAttachmentClick = useCallback(
    ({ attachmentKey, label }: UploadedAttachmentOpenRequest) => {
      const filePath = `uploaded-attachment:${attachmentKey}`;
      setOpenFiles((prev: OpenFileTab[]) => {
        if (prev.some((f: OpenFileTab) => f.filePath === filePath)) return prev;
        return [
          ...prev,
          {
            filePath,
            fileName: label || "Attachment",
            isUploadedAttachment: true,
            attachmentKey,
          },
        ];
      });
      setActiveFilePath(filePath);
      setActiveTerminalId(null);
    },
    [setActiveTerminalId],
  );

  const handleDiffFileClick = useCallback(
    (filePath: string, status: string) => {
      const diffKey = `diff:${filePath}`;
      setOpenFiles((prev: OpenFileTab[]) => {
        if (prev.some((f: OpenFileTab) => f.filePath === diffKey)) return prev;
        const fileName = filePath.split("/").pop() ?? filePath;
        return [...prev, { filePath: diffKey, fileName, isDiff: true, diffStatus: status }];
      });
      setActiveFilePath(diffKey);
      setActiveTerminalId(null);
    },
    [setActiveTerminalId],
  );

  const handleSelectFile = useCallback(
    (filePath: string) => {
      setActiveFilePath(filePath);
      setActiveTerminalId(null);
    },
    [setActiveTerminalId],
  );

  const handleCloseFile = useCallback((filePath: string) => {
    setOpenFiles((prev: OpenFileTab[]) => prev.filter((f: OpenFileTab) => f.filePath !== filePath));
    setActiveFilePath((prev: string | null) => (prev === filePath ? null : prev));
  }, []);

  return {
    openFiles,
    activeFilePath,
    setActiveFilePath,
    handleFileClick,
    handleDraftAttachmentClick,
    handleUploadedAttachmentClick,
    handleDiffFileClick,
    handleSelectFile,
    handleCloseFile,
  };
}
