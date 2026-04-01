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

interface SessionGroupContentAreaProps {
  sessionGroupId: string;
  activeFilePath: string | null;
  openFiles: OpenFileTab[];
  activeTerminalId: string | null;
  selectedSession: { id: string; _optimistic?: boolean } | null;
  defaultBranch: string;
  scrollToEventId: string | null;
  onScrollComplete: () => void;
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
}: SessionGroupContentAreaProps) {
  const isOptimistic = selectedSession?._optimistic === true;

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
            status={openFiles.find((f) => f.filePath === activeFilePath)?.diffStatus ?? "M"}
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
            key={activeFilePath}
            sessionGroupId={sessionGroupId}
            filePath={activeFilePath}
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

  if (isOptimistic) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <div className="max-w-sm space-y-2">
          <p className="text-sm font-medium text-foreground">Creating session...</p>
          <p className="text-sm text-muted-foreground">
            The session is being created in the background. Input and runtime controls will unlock
            once the real session ID is ready.
          </p>
        </div>
      </div>
    );
  }

  if (selectedSession) {
    return (
      <SessionDetailView
        sessionId={selectedSession.id}
        hideHeader
        scrollToEventId={scrollToEventId}
        onScrollComplete={onScrollComplete}
      />
    );
  }

  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      Select a chat tab to continue.
    </div>
  );
}
