import { useCallback, useRef } from "react";
import { useUIStore } from "../../stores/ui";
import type { OpenFileTab } from "./openFileTab";
import type { FileOpenRequest } from "./FileOpenContext";
import type { FileEditorBuffer } from "./file-editor-buffer";
import type {
  DraftAttachmentOpenRequest,
  UploadedAttachmentOpenRequest,
} from "./AttachmentOpenContext";

const EMPTY_OPEN_FILES: OpenFileTab[] = [];

export function useFileActions(sessionGroupId: string) {
  const setActiveTerminalId = useUIStore(
    (s: { setActiveTerminalId: (id: string | null) => void }) => s.setActiveTerminalId,
  );
  const openFiles = useUIStore((s) => s.openFileTabsByGroup[sessionGroupId] ?? EMPTY_OPEN_FILES);
  const activeFilePath = useUIStore((s) => s.activeFilePathsByGroup[sessionGroupId] ?? null);
  const openFileTab = useUIStore((s) => s.openFileTab);
  const closeFileTab = useUIStore((s) => s.closeFileTab);
  const setGroupActiveFilePath = useUIStore((s) => s.setActiveFilePath);
  const setActiveFilePath = useCallback(
    (filePath: string | null) => setGroupActiveFilePath(sessionGroupId, filePath),
    [sessionGroupId, setGroupActiveFilePath],
  );
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
      const fileName = filePath.split("/").pop() ?? filePath;
      const file: OpenFileTab = { filePath, fileName };
      if (lineNumber) file.lineNumber = lineNumber;
      openFileTab(sessionGroupId, file);
      setActiveTerminalId(null);
    },
    [openFileTab, sessionGroupId, setActiveTerminalId],
  );

  const handleDraftAttachmentClick = useCallback(
    ({ sessionId, attachmentId, fileName }: DraftAttachmentOpenRequest) => {
      const filePath = `attachment:${sessionId}:${attachmentId}`;
      openFileTab(sessionGroupId, {
        filePath,
        fileName: fileName || "Attachment",
        isDraftAttachment: true,
        attachmentSessionId: sessionId,
        attachmentId,
      });
      setActiveTerminalId(null);
    },
    [openFileTab, sessionGroupId, setActiveTerminalId],
  );

  const handleUploadedAttachmentClick = useCallback(
    ({ attachmentKey, label }: UploadedAttachmentOpenRequest) => {
      const filePath = `uploaded-attachment:${attachmentKey}`;
      openFileTab(sessionGroupId, {
        filePath,
        fileName: label || "Attachment",
        isUploadedAttachment: true,
        attachmentKey,
      });
      setActiveTerminalId(null);
    },
    [openFileTab, sessionGroupId, setActiveTerminalId],
  );

  const handleDiffFileClick = useCallback(
    (filePath: string, status: string) => {
      const diffKey = `diff:${filePath}`;
      const fileName = filePath.split("/").pop() ?? filePath;
      openFileTab(sessionGroupId, {
        filePath: diffKey,
        fileName,
        isDiff: true,
        diffStatus: status,
      });
      setActiveTerminalId(null);
    },
    [openFileTab, sessionGroupId, setActiveTerminalId],
  );

  const handleSelectFile = useCallback(
    (filePath: string) => {
      setActiveFilePath(filePath);
      setActiveTerminalId(null);
    },
    [setActiveFilePath, setActiveTerminalId],
  );

  const handleCloseFile = useCallback(
    (filePath: string) => {
      fileBuffersRef.current.delete(filePath);
      closeFileTab(sessionGroupId, filePath);
    },
    [closeFileTab, sessionGroupId],
  );

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
