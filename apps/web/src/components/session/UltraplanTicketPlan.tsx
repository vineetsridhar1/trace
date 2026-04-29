import { GitBranch, Link2 } from "lucide-react";
import { useUIStore } from "../../stores/ui";
import { cn } from "../../lib/utils";
import {
  formatUltraplanStatus,
  type UltraplanTicketExecutionSummary,
  type UltraplanTicketSummary,
} from "./ultraplan-panel-types";

interface UltraplanTicketPlanProps {
  tickets: UltraplanTicketSummary[];
  executions: UltraplanTicketExecutionSummary[];
  sessionGroupId: string;
}

export function UltraplanTicketPlan({
  tickets,
  executions,
  sessionGroupId,
}: UltraplanTicketPlanProps) {
  const openSessionTab = useUIStore((s) => s.openSessionTab);
  const setActiveSessionId = useUIStore((s) => s.setActiveSessionId);
  const setActiveTerminalId = useUIStore((s) => s.setActiveTerminalId);

  const orderedTickets = [...tickets].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  if (orderedTickets.length === 0) {
    return (
      <div className="text-xs text-muted-foreground">
        No planned tickets yet. The controller is still preparing the plan.
      </div>
    );
  }

  return (
    <div className="min-w-0 flex-1 space-y-1.5">
      <div className="text-[11px] font-medium uppercase text-muted-foreground">Ticket plan</div>
      <div className="max-h-44 space-y-1 overflow-auto pr-1">
        {orderedTickets.map((planTicket) => {
          const ticket = planTicket.ticket;
          const execution = executions.find((item) => item.ticketId === ticket?.id);
          const workerSessionId = execution?.workerSessionId;
          const dependencies = Array.isArray(ticket?.dependencies) ? ticket.dependencies : [];
          return (
            <div
              key={planTicket.id}
              className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-border/60 bg-surface-deep px-2 py-1.5 text-xs"
            >
              <span className="text-muted-foreground">{planTicket.position ?? "-"}</span>
              <div className="min-w-0">
                <div className="truncate text-foreground">{ticket?.title ?? "Untitled ticket"}</div>
                <div className="mt-0.5 flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="capitalize">{formatUltraplanStatus(planTicket.status)}</span>
                  {execution ? (
                    <span className="capitalize">
                      {formatUltraplanStatus(execution.status)}
                      {execution.integrationStatus
                        ? ` / ${formatUltraplanStatus(execution.integrationStatus)}`
                        : ""}
                    </span>
                  ) : (
                    <span>not started</span>
                  )}
                  {execution?.branch ? (
                    <span className="inline-flex min-w-0 items-center gap-1">
                      <GitBranch size={10} />
                      <span className="truncate">{execution.branch}</span>
                    </span>
                  ) : null}
                  {dependencies.length > 0 ? (
                    <span className="truncate">blocked by {dependencies.length}</span>
                  ) : (
                    <span>ready</span>
                  )}
                </div>
              </div>
              <button
                type="button"
                disabled={!workerSessionId}
                onClick={() => {
                  if (!workerSessionId) return;
                  openSessionTab(sessionGroupId, workerSessionId);
                  setActiveSessionId(workerSessionId);
                  setActiveTerminalId(null);
                }}
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-elevated hover:text-foreground disabled:opacity-30",
                  workerSessionId ? "cursor-pointer" : "cursor-default",
                )}
                title={workerSessionId ? "Open worker session" : "No worker session"}
              >
                <Link2 size={13} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
