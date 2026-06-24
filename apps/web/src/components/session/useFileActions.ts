import { useCallback, useRef, useState } from "react";
import { useUIStore } from "../../stores/ui";
import type { OpenFileTab } from "./GroupTabStrip";
import type { FileOpenRequest } from "./FileOpenContext";
import type { FileEditorBuffer } from "./file-editor-buffer";
import type {
  DraftAttachmentOpenRequest,
  UploadedAttachmentOpenRequest,
} from "./AttachmentOpenContext";

export function useFileActions() {
  const setActiveTerminalId = useUIStore(
    (s: { setActiveTerminalId: (id: string | null) => void }) => s.setActiveTerminalId,
  );
  const setActiveBrowserId = useUIStore(
    (s: { setActiveBrowserId: (id: string | null) => void }) => s.setActiveBrowserId,
  );
  const [openFiles, setOpenFiles] = useState<OpenFileTab[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const fileBuffersRef = useRef(new Map<string, FileEditorBuffer>());

  const getFileBuffer = useCallback((filePath: string) => {
    return fileBuffersRef.current.get(filePath);
  }, []);

  const setFileBuffer = useCallback((filePath: string, buffer: FileEditorBuffer) => {
    fileBuffersRef.current.set(filePath, buffer);
  }, []);

  const handleFileClick = useCallback(
    (request: string | FileOpenRequest) => {
      const filePath = typeof request === "string" ? request : request.filePath;
      const lineNumber = typeof request === "string" ? undefined : request.lineNumber;
      setOpenFiles((prev: OpenFileTab[]) => {
        if (prev.some((f: OpenFileTab) => f.filePath === filePath)) {
          return prev.map((file) =>
            file.filePath === filePath && lineNumber ? { ...file, lineNumber } : file,
          );
        }
        const fileName = filePath.split("/").pop() ?? filePath;
        const nextFile: OpenFileTab = { filePath, fileName };
        if (lineNumber) nextFile.lineNumber = lineNumber;
        return [...prev, nextFile];
      });
      setActiveFilePath(filePath);
      setActiveTerminalId(null);
      setActiveBrowserId(null);
    },
    [setActiveTerminalId, setActiveBrowserId],
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
      setActiveBrowserId(null);
    },
    [setActiveTerminalId, setActiveBrowserId],
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
      setActiveBrowserId(null);
    },
    [setActiveTerminalId, setActiveBrowserId],
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
      setActiveBrowserId(null);
    },
    [setActiveTerminalId, setActiveBrowserId],
  );

  const handleSelectFile = useCallback(
    (filePath: string) => {
      setActiveFilePath(filePath);
      setActiveTerminalId(null);
      setActiveBrowserId(null);
    },
    [setActiveTerminalId, setActiveBrowserId],
  );

  const handleCloseFile = useCallback((filePath: string) => {
    fileBuffersRef.current.delete(filePath);
    setOpenFiles((prev: OpenFileTab[]) => prev.filter((f: OpenFileTab) => f.filePath !== filePath));
    setActiveFilePath((prev: string | null) => (prev === filePath ? null : prev));
  }, []);

  return {
    openFiles,
    activeFilePath,
    setActiveFilePath,
    getFileBuffer,
    setFileBuffer,
    handleFileClick,
    handleDraftAttachmentClick,
    handleUploadedAttachmentClick,
    handleDiffFileClick,
    handleSelectFile,
    handleCloseFile,
  };
}
