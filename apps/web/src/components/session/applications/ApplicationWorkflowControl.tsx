import { useCallback, useMemo, useState } from "react";
import { gql } from "@urql/core";
import { Rocket } from "lucide-react";
import type { SessionApplicationWorkflowRun } from "@trace/gql";
import { useEntityStore } from "@trace/client-core";
import { cn } from "@/lib/utils";
import { client } from "../../../lib/urql";
import { Button } from "../../ui/button";
import { TraceLoader } from "../../ui/trace-loader";

const START_WORKFLOW_MUTATION = gql`
  mutation StartSessionApplicationWorkflow($sessionGroupId: ID!, $appConfigId: ID!) {
    startSessionApplicationWorkflow(sessionGroupId: $sessionGroupId, appConfigId: $appConfigId) {
      id
    }
  }
`;

function stepDotClass(status: string): string {
  if (status === "completed") return "bg-emerald-500";
  if (status === "failed") return "bg-destructive";
  if (status === "running") return "bg-amber-500";
  return "bg-muted-foreground/40";
}

export function ApplicationWorkflowControl({
  sessionGroupId,
  appConfigId,
}: {
  sessionGroupId: string;
  appConfigId: string;
}) {
  const workflowTable = useEntityStore((s) => s.sessionApplicationWorkflowRuns);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const latestRun = useMemo<SessionApplicationWorkflowRun | null>(() => {
    const runs = Object.values(workflowTable).filter(
      (run) => run.sessionGroupId === sessionGroupId && run.appConfigId === appConfigId,
    );
    runs.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
    return runs[0] ?? null;
  }, [workflowTable, sessionGroupId, appConfigId]);

  const running = latestRun?.status === "running";

  const start = useCallback(async () => {
    setPending(true);
    setError(null);
    try {
      const result = await client
        .mutation(START_WORKFLOW_MUTATION, { sessionGroupId, appConfigId })
        .toPromise();
      if (result.error) throw new Error(result.error.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }, [sessionGroupId, appConfigId]);

  return (
    <div className="space-y-2 rounded-md border border-border/70 bg-background/35 px-2.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {running ? (
            <TraceLoader size={12} showLabel={false} className="shrink-0" />
          ) : (
            <Rocket size={13} className="shrink-0 text-muted-foreground" />
          )}
          <span className="truncate text-xs font-medium text-foreground">
            {running
              ? "Starting everything…"
              : latestRun?.status === "completed"
                ? "All set — everything is running"
                : latestRun?.status === "failed"
                  ? "Start everything"
                  : "Start everything"}
          </span>
        </div>
        <Button type="button" size="sm" disabled={pending || running} onClick={() => void start()}>
          {latestRun && latestRun.status !== "completed" && !running ? "Retry" : "Start everything"}
        </Button>
      </div>
      {error && <p className="text-[11px] text-destructive">{error}</p>}
      {latestRun && (
        <div className="space-y-1 rounded bg-surface-deep/60 px-2 py-1.5">
          {latestRun.steps.map((step) => (
            <div key={step.stepId} className="flex items-center gap-1.5 text-[11px]">
              {step.status === "running" ? (
                <TraceLoader size={10} showLabel={false} className="shrink-0" />
              ) : (
                <span className={cn("size-1.5 shrink-0 rounded-full", stepDotClass(step.status))} />
              )}
              <span className="truncate text-muted-foreground">
                {step.label}
                {step.optional ? " (optional)" : ""}
              </span>
            </div>
          ))}
          {latestRun.status === "failed" && latestRun.lastError && (
            <p className="pt-1 text-[11px] text-destructive">{latestRun.lastError}</p>
          )}
        </div>
      )}
    </div>
  );
}
