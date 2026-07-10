import { useState } from "react";
import { ChevronDown, RotateCw } from "lucide-react";
import type { SessionApplicationLogEntry, SessionApplicationProcess } from "@trace/gql";
import { cn } from "../../../lib/utils";
import { Button } from "../../ui/button";

export function ProcessLogs({
  entries,
  process,
  refreshing,
  onRefresh,
}: {
  entries: SessionApplicationLogEntry[];
  process: SessionApplicationProcess;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const logsId = `process-logs-${process.id}`;
  const summary =
    process.lastError ??
    (process.exitCode != null ? `Exited ${process.exitCode}` : open ? "Hide logs" : "View logs");

  return (
    <div className="overflow-hidden rounded bg-surface-deep/60">
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={logsId}
          className="flex min-w-0 flex-1 touch-manipulation items-center justify-between gap-2 px-2 py-1.5 text-left text-[11px] text-muted-foreground transition-colors hover:bg-background/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setOpen((current) => !current)}
        >
          <span className="truncate">{summary}</span>
          <ChevronDown
            size={12}
            className={cn(
              "shrink-0 transition-transform duration-200 motion-reduce:transition-none",
              open && "rotate-180",
            )}
          />
        </button>
        <Button
          variant="ghost"
          size="icon-xs"
          title={`Refresh ${process.label} logs`}
          aria-label={`Refresh ${process.label} logs`}
          className="mr-1 shrink-0"
          disabled={refreshing}
          onClick={onRefresh}
        >
          <RotateCw size={12} className={cn(refreshing && "animate-spin")} />
        </Button>
      </div>
      <div
        id={logsId}
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="max-h-44 space-y-1 overflow-auto border-t border-border/60 bg-background/40 px-2 py-1.5">
            {entries.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">No logs yet.</p>
            ) : (
              entries.slice(-16).map((entry) => (
                <div
                  key={entry.id}
                  className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-2 text-[11px] leading-4"
                >
                  <span
                    className={cn(
                      "font-mono",
                      entry.stream === "stderr" ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {entry.stream}
                  </span>
                  <span className="whitespace-pre-wrap break-words font-mono text-foreground">
                    {entry.data.trim() || "(empty)"}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
