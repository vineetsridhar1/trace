import { useMemo } from "react";
import { Workflow } from "lucide-react";
import { useEntityField } from "@trace/client-core";
import { cn } from "../../lib/utils";
import { UltraplanControllerTimeline } from "./UltraplanControllerTimeline";
import { UltraplanStatusActions } from "./UltraplanStatusActions";
import { UltraplanTicketPlan } from "./UltraplanTicketPlan";
import { formatUltraplanStatus, type UltraplanSummary } from "./ultraplan-panel-types";

function asUltraplanSummary(value: unknown): UltraplanSummary | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return typeof record.id === "string" && typeof record.status === "string"
    ? (record as unknown as UltraplanSummary)
    : null;
}

export function UltraplanStatusPanel({
  sessionGroupId,
  canInteract,
}: {
  sessionGroupId: string;
  canInteract: boolean;
}) {
  const rawUltraplan = useEntityField("sessionGroups", sessionGroupId, "ultraplan");
  const ultraplan = asUltraplanSummary(rawUltraplan);

  const latestRun = useMemo(() => {
    const runs = Array.isArray(ultraplan?.controllerRuns) ? ultraplan.controllerRuns : [];
    return [...runs].sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    })[0];
  }, [ultraplan?.controllerRuns]);

  if (!ultraplan) return null;

  const ultraplanId = ultraplan.id;
  const ticketCount = Array.isArray(ultraplan.tickets) ? ultraplan.tickets.length : 0;
  const tickets = Array.isArray(ultraplan.tickets) ? ultraplan.tickets : [];
  const executionCount = Array.isArray(ultraplan.ticketExecutions)
    ? ultraplan.ticketExecutions.length
    : 0;
  const executions = Array.isArray(ultraplan.ticketExecutions) ? ultraplan.ticketExecutions : [];
  const controllerRuns = Array.isArray(ultraplan.controllerRuns) ? ultraplan.controllerRuns : [];
  const controllerRunCount = Array.isArray(ultraplan.controllerRuns)
    ? ultraplan.controllerRuns.length
    : latestRun
      ? 1
      : 0;

  return (
    <div className="shrink-0 border-b border-border bg-surface px-4 py-2">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Workflow size={15} className="shrink-0 text-cyan-400" />
          <span className="text-sm font-medium text-foreground">Ultraplan</span>
          <span
            className={cn(
              "rounded border px-1.5 py-0.5 text-xs capitalize",
              ultraplan.status === "failed" || ultraplan.status === "cancelled"
                ? "border-destructive/40 text-destructive"
                : ultraplan.status === "paused" || ultraplan.status === "needs_human"
                  ? "border-amber-500/40 text-amber-300"
                  : "border-cyan-500/40 text-cyan-300",
            )}
          >
            {formatUltraplanStatus(ultraplan.status)}
          </span>
          <span className="min-w-0 truncate text-xs text-muted-foreground">
            {ultraplan.lastControllerSummary ??
              latestRun?.summary ??
              latestRun?.summaryTitle ??
              ultraplan.planSummary ??
              "Controller run queued"}
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{ticketCount} tickets</span>
          <span>{executionCount} executions</span>
          <span>{controllerRunCount} runs</span>
          {ultraplan.integrationBranch ? <span>{ultraplan.integrationBranch}</span> : null}
        </div>

        <UltraplanStatusActions
          ultraplanId={ultraplanId}
          status={ultraplan.status}
          canInteract={canInteract}
        />
      </div>
      <div className="mt-2 grid gap-3 lg:grid-cols-2">
        <UltraplanTicketPlan
          tickets={tickets}
          executions={executions}
          sessionGroupId={sessionGroupId}
        />
        <UltraplanControllerTimeline runs={controllerRuns} />
      </div>
    </div>
  );
}
