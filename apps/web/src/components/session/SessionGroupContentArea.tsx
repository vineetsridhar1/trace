import { lazy, Suspense, type ReactNode } from "react";
import type { SessionEntity } from "@trace/client-core";
import { SessionDetailView } from "./SessionDetailView";
import { TerminalInstance } from "./TerminalInstance";
import { FileScopedAiInput } from "./FileScopedAiInput";
import { SessionEndpointTrafficPanel } from "./applications/SessionEndpointTrafficPanel";
import type { OpenFileTab } from "./GroupTabStrip";
import type { FileEditorBuffer } from "./file-editor-buffer";

const MonacoFileViewer = lazy(() =>
  import("./MonacoFileViewer").then((m) => ({ default: m.MonacoFileViewer })),
);
const MonacoDiffViewer = lazy(() =>
  import("./MonacoDiffViewer").then((m) => ({ default: m.MonacoDiffViewer })),
);
const DraftAttachmentEditor = lazy(() =>
  import("./DraftAttachmentEditor").then((m) => ({ default: m.DraftAttachmentEditor })),
);
const UploadedAttachmentViewer = lazy(() =>
  import("./UploadedAttachmentViewer").then((m) => ({ default: m.UploadedAttachmentViewer })),
);

interface SessionGroupContentAreaProps {
  sessionGroupId: string;
  activeFilePath: string | null;
  openFiles: OpenFileTab[];
  activeTerminalId: string | null;
  activeTrafficEndpointId: string | null;
  selectedSession: { id: string; _optimistic?: boolean } | null;
  sessionsByRecency: SessionEntity[];
  canStartNewChat: boolean;
  onStartNewChat: () => Promise<string | null>;
  defaultBranch: string;
  scrollToEventId: string | null;
  onScrollComplete: () => void;
  onForkSession: (eventId: string) => void;
  canForkSession: boolean;
  getFileBuffer: (filePath: string) => FileEditorBuffer | undefined;
  setFileBuffer: (filePath: string, buffer: FileEditorBuffer) => void;
  emptyState?: ReactNode;
}

export function SessionGroupContentArea({
  sessionGroupId,
  activeFilePath,
  openFiles,
  activeTerminalId,
  activeTrafficEndpointId,
  selectedSession,
  sessionsByRecency,
  canStartNewChat,
  onStartNewChat,
  defaultBranch,
  scrollToEventId,
  onScrollComplete,
  onForkSession,
  canForkSession,
  getFileBuffer,
  setFileBuffer,
  emptyState,
}: SessionGroupContentAreaProps) {
  const activeFile = openFiles.find((file) => file.filePath === activeFilePath);

  if (activeFile?.isUploadedAttachment && activeFile.attachmentKey) {
    return (
      <div className="h-full">
        <Suspense
          fallback={<div className="flex h-full items-center justify-center bg-[#1e1e1e]" />}
        >
          <UploadedAttachmentViewer
            key={activeFile.filePath}
            attachmentKey={activeFile.attachmentKey}
            label={activeFile.fileName}
          />
        </Suspense>
      </div>
    );
  }

  if (activeFile?.isDraftAttachment && activeFile.attachmentSessionId && activeFile.attachmentId) {
    return (
      <div className="h-full">
        <Suspense
          fallback={<div className="flex h-full items-center justify-center bg-[#1e1e1e]" />}
        >
          <DraftAttachmentEditor
            key={activeFile.filePath}
            sessionId={activeFile.attachmentSessionId}
            attachmentId={activeFile.attachmentId}
          />
        </Suspense>
      </div>
    );
  }

  if (activeFilePath?.startsWith("diff:")) {
    const diffFilePath = activeFilePath.slice(5);

    return (
      <div className="flex h-full flex-col">
        <div className="min-h-0 flex-1">
          <Suspense
            fallback={<div className="flex h-full items-center justify-center bg-[#1e1e1e]" />}
          >
            <MonacoDiffViewer
              key={activeFilePath}
              sessionGroupId={sessionGroupId}
              filePath={diffFilePath}
              status={activeFile?.diffStatus ?? "M"}
              defaultBranch={defaultBranch}
            />
          </Suspense>
        </div>
        <FileScopedAiInput
          filePath={diffFilePath}
          sessions={sessionsByRecency}
          canStartNewChat={canStartNewChat}
          onStartNewChat={onStartNewChat}
        />
      </div>
    );
  }

  if (activeFilePath) {
    return (
      <div className="flex h-full flex-col">
        <div className="min-h-0 flex-1">
          <Suspense
            fallback={<div className="flex h-full items-center justify-center bg-[#1e1e1e]" />}
          >
            <MonacoFileViewer
              key={`${activeFilePath}:${activeFile?.lineNumber ?? ""}`}
              sessionGroupId={sessionGroupId}
              filePath={activeFilePath}
              initialLineNumber={activeFile?.lineNumber}
              buffer={getFileBuffer(activeFilePath)}
              onBufferChange={setFileBuffer}
            />
          </Suspense>
        </div>
        <FileScopedAiInput
          filePath={activeFilePath}
          sessions={sessionsByRecency}
          canStartNewChat={canStartNewChat}
          onStartNewChat={onStartNewChat}
        />
      </div>
    );
  }

  if (activeTerminalId) {
    return (
      <div className="h-full bg-[#0a0a0a]">
        <TerminalInstance terminalId={activeTerminalId} visible />
      </div>
    );
  }

  if (activeTrafficEndpointId) {
    return (
      <SessionEndpointTrafficPanel
        sessionGroupId={sessionGroupId}
        initialEndpointId={activeTrafficEndpointId}
      />
    );
  }

  if (selectedSession) {
    return (
      <SessionDetailView
        key={selectedSession.id}
        sessionId={selectedSession.id}
        hideHeader
        scrollToEventId={scrollToEventId}
        onScrollComplete={onScrollComplete}
        onForkSession={onForkSession}
        canForkSession={canForkSession}
      />
    );
  }

  return (
    emptyState ?? (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Select a chat tab to continue.
      </div>
    )
  );
}
