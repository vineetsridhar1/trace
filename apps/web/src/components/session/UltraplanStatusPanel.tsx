import { Workflow } from "lucide-react";
import {
  useActiveUltraplanBySessionGroupId,
  useControllerRunsByUltraplanId,
  useLatestControllerRunSummary,
  usePlannedTicketsByUltraplanId,
  useTicketExecutionsByUltraplanId,
} from "@trace/client-core";
import { cn } from "../../lib/utils";
import { UltraplanControllerTimeline } from "./UltraplanControllerTimeline";
import { UltraplanStatusActions } from "./UltraplanStatusActions";
import { UltraplanTicketPlan } from "./UltraplanTicketPlan";
import { formatUltraplanStatus } from "./ultraplan-panel-types";

export function UltraplanStatusPanel({
  sessionGroupId,
  canInteract,
}: {
  sessionGroupId: string;
  canInteract: boolean;
}) {
  const ultraplan = useActiveUltraplanBySessionGroupId(sessionGroupId);
  const ultraplanId = ultraplan?.id;
  const tickets = usePlannedTicketsByUltraplanId(ultraplanId);
  const executions = useTicketExecutionsByUltraplanId(ultraplanId);
  const controllerRuns = useControllerRunsByUltraplanId(ultraplanId);
  const latestRunSummary = useLatestControllerRunSummary(ultraplanId);

  if (!ultraplan) return null;

  const activeUltraplanId = ultraplan.id;
  const ticketCount = tickets.length;
  const executionCount = executions.length;
  const controllerRunCount = controllerRuns.length;

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
              latestRunSummary ??
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
          ultraplanId={activeUltraplanId}
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
