import { lazy, Suspense } from "react";
import { SessionDetailView } from "./SessionDetailView";
import { TerminalInstance } from "./TerminalInstance";
import type { OpenFileTab } from "./GroupTabStrip";

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
  selectedSession: { id: string; _optimistic?: boolean } | null;
  defaultBranch: string;
  scrollToEventId: string | null;
  onScrollComplete: () => void;
  onForkSession: (eventId: string) => void;
  canForkSession: boolean;
}

export function SessionGroupContentArea({
  sessionGroupId,
  activeFilePath,
  openFiles,
  activeTerminalId,
  selectedSession,
  defaultBranch,
  scrollToEventId,
  onScrollComplete,
  onForkSession,
  canForkSession,
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
    return (
      <div className="h-full">
        <Suspense
          fallback={<div className="flex h-full items-center justify-center bg-[#1e1e1e]" />}
        >
          <MonacoDiffViewer
            key={activeFilePath}
            sessionGroupId={sessionGroupId}
            filePath={activeFilePath.slice(5)}
            status={activeFile?.diffStatus ?? "M"}
            defaultBranch={defaultBranch}
          />
        </Suspense>
      </div>
    );
  }

  if (activeFilePath) {
    return (
      <div className="h-full">
        <Suspense
          fallback={<div className="flex h-full items-center justify-center bg-[#1e1e1e]" />}
        >
          <MonacoFileViewer
            key={`${activeFilePath}:${activeFile?.lineNumber ?? ""}`}
            sessionGroupId={sessionGroupId}
            filePath={activeFilePath}
            initialLineNumber={activeFile?.lineNumber}
          />
        </Suspense>
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
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      Select a chat tab to continue.
    </div>
  );
}
