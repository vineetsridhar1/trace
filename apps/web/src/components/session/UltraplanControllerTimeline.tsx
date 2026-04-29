import { useState } from "react";
import { MessageSquareText } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { SessionDetailView } from "./SessionDetailView";
import {
  formatUltraplanStatus,
  type UltraplanControllerRunSummary,
} from "./ultraplan-panel-types";

interface UltraplanControllerTimelineProps {
  runs: UltraplanControllerRunSummary[];
}

function formatRunTime(value: string | null | undefined): string {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function UltraplanControllerTimeline({ runs }: UltraplanControllerTimelineProps) {
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);
  const orderedRuns = [...runs].sort((a, b) => {
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bTime - aTime;
  });

  return (
    <div className="min-w-0 flex-1 space-y-1.5">
      <div className="text-[11px] font-medium uppercase text-muted-foreground">
        Controller timeline
      </div>
      {orderedRuns.length === 0 ? (
        <div className="text-xs text-muted-foreground">No controller runs recorded yet.</div>
      ) : (
        <div className="max-h-44 space-y-1 overflow-auto pr-1">
          {orderedRuns.map((run) => (
            <div
              key={run.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-md border border-border/60 bg-surface-deep px-2 py-1.5 text-xs"
            >
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-foreground">
                    {run.summaryTitle ?? "Controller run"}
                  </span>
                  <span className="shrink-0 capitalize text-muted-foreground">
                    {formatUltraplanStatus(run.status)}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {run.summary ?? formatRunTime(run.createdAt)}
                </div>
              </div>
              <button
                type="button"
                disabled={!run.sessionId}
                onClick={() => setOpenSessionId(run.sessionId ?? null)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-elevated hover:text-foreground disabled:opacity-30"
                title={run.sessionId ? "Open controller chat" : "No controller chat"}
              >
                <MessageSquareText size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={openSessionId !== null} onOpenChange={(open) => !open && setOpenSessionId(null)}>
        <DialogContent className="flex h-[80vh] max-w-[min(1100px,calc(100vw-2rem))] flex-col p-0">
          <DialogHeader className="border-b border-border px-4 py-3">
            <DialogTitle>Controller run chat</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-hidden">
            {openSessionId ? <SessionDetailView sessionId={openSessionId} hideHeader /> : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
