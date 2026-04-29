import { useMemo } from "react";
import { Workflow } from "lucide-react";
import { useEntityField } from "@trace/client-core";
import { cn } from "../../lib/utils";
import { UltraplanStatusActions } from "./UltraplanStatusActions";

type UltraplanStatus = string;

interface UltraplanTicketSummary {
  id: string;
  status?: string | null;
}

interface UltraplanControllerRunSummary {
  id: string;
  status?: string | null;
  summaryTitle?: string | null;
  summary?: string | null;
  createdAt?: string | null;
}

interface UltraplanSummary {
  id: string;
  status: UltraplanStatus;
  planSummary?: string | null;
  lastControllerSummary?: string | null;
  integrationBranch?: string | null;
  activeInboxItemId?: string | null;
  tickets?: UltraplanTicketSummary[] | null;
  ticketExecutions?: unknown[] | null;
  controllerRuns?: UltraplanControllerRunSummary[] | null;
}

function asUltraplanSummary(value: unknown): UltraplanSummary | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return typeof record.id === "string" && typeof record.status === "string"
    ? (record as unknown as UltraplanSummary)
    : null;
}

function statusLabel(status: string): string {
  return status.replace(/_/g, " ");
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
  const executionCount = Array.isArray(ultraplan.ticketExecutions)
    ? ultraplan.ticketExecutions.length
    : 0;
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
            {statusLabel(ultraplan.status)}
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
    </div>
  );
}
