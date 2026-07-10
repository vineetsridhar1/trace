import type { ReactNode } from "react";
import { SessionDetailView } from "./SessionDetailView";

export function AppSessionWorkspace({
  sessionId,
  scrollToEventId,
  onScrollComplete,
  onForkSession,
  canForkSession,
  canvas,
}: {
  sessionId: string | null;
  scrollToEventId: string | null;
  onScrollComplete: () => void;
  onForkSession: (eventId: string) => void;
  canForkSession: boolean;
  canvas: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <aside className="h-full w-[clamp(22rem,33vw,34rem)] shrink-0 border-r border-border bg-background">
        {sessionId ? (
          <SessionDetailView
            key={sessionId}
            sessionId={sessionId}
            hideHeader
            scrollToEventId={scrollToEventId}
            onScrollComplete={onScrollComplete}
            onForkSession={onForkSession}
            canForkSession={canForkSession}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Loading messages…
          </div>
        )}
      </aside>
      <main className="min-w-0 flex-1 bg-surface-deep">{canvas}</main>
    </div>
  );
}
