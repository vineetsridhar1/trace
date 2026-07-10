import { useState } from "react";
import { ChevronDown, Play } from "lucide-react";
import type { RepoSetupScript, SessionSetupScriptRun } from "@trace/gql";
import { cn } from "../../../lib/utils";
import { Button } from "../../ui/button";
import { TraceLoader } from "../../ui/trace-loader";
import { displayApplicationStatus } from "./session-applications-operations";

export function SetupScriptCard({
  script,
  latestRun,
  pending,
  onRun,
}: {
  script: RepoSetupScript;
  latestRun?: SessionSetupScriptRun;
  pending: boolean;
  onRun: () => void;
}) {
  const [logsOpen, setLogsOpen] = useState(false);
  const runOutput = latestRun?.lastError ?? latestRun?.outputPreview;
  const logsId = `setup-logs-${script.id}`;

  return (
    <div className="space-y-2 rounded-md border border-border/70 bg-background/35 px-2.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{script.name}</p>
          <p className="truncate text-[11px] text-muted-foreground">{script.command}</p>
        </div>
        <Button
          variant="outline"
          size="icon-sm"
          title={`Run ${script.name}`}
          aria-label={`Run ${script.name}`}
          disabled={pending || latestRun?.status === "running"}
          onClick={onRun}
        >
          <Play size={14} />
        </Button>
      </div>
      {latestRun ? (
        <div className="space-y-1 rounded bg-surface-deep/60 px-2 py-1.5">
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <div className="flex min-w-0 items-center gap-1.5">
              {latestRun.status === "running" ? (
                <TraceLoader size={12} showLabel={false} className="shrink-0" />
              ) : (
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    latestRun.status === "completed" ? "bg-emerald-500" : "bg-destructive",
                  )}
                  aria-hidden="true"
                />
              )}
              <span className="truncate text-muted-foreground">
                {displayApplicationStatus(latestRun.status)}
                {latestRun.exitCode != null && latestRun.exitCode !== 0
                  ? ` ${latestRun.exitCode}`
                  : ""}
              </span>
            </div>
            {latestRun.outputTruncated ? (
              <span className="shrink-0 text-muted-foreground">Truncated</span>
            ) : null}
          </div>
          <button
            type="button"
            aria-expanded={logsOpen}
            aria-controls={logsId}
            className="flex w-full touch-manipulation items-center justify-between rounded px-1 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-background/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setLogsOpen((open) => !open)}
          >
            <span>{logsOpen ? "Hide logs" : "View logs"}</span>
            <ChevronDown
              size={12}
              className={cn(
                "transition-transform duration-200 motion-reduce:transition-none",
                logsOpen && "rotate-180",
              )}
            />
          </button>
          <div
            id={logsId}
            className={cn(
              "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
              logsOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
            )}
          >
            <div className="min-h-0 overflow-hidden">
              <pre
                className={cn(
                  "max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-background/40 px-2 py-1.5 font-mono text-[11px] leading-4 text-foreground",
                  !runOutput && "text-muted-foreground",
                )}
              >
                {(runOutput || "No logs yet.").trim()}
              </pre>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
