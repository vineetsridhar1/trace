import { useMemo, useState, type ReactNode } from "react";
import { gql } from "@urql/core";
import { AlertCircle, Ban, ExternalLink, FastForward, Pause, Play, RotateCw } from "lucide-react";
import type { Session, TicketExecution, Ultraplan, UltraplanControllerRun } from "@trace/gql";
import { toast } from "sonner";
import { client } from "../../lib/urql";
import { cn } from "../../lib/utils";

interface UltraplanPanelProps {
  sessionGroupId: string;
  groupName?: string;
  groupBranch?: string | null;
  groupPrUrl?: string | null;
  ultraplan: Ultraplan | null;
  controllerSession?: Pick<Session, "tool" | "model" | "hosting"> | null;
  runtimeInstanceId?: string | null;
  canInteract: boolean;
  onOpenSession: (sessionId: string) => void;
}

const START_ULTRAPLAN_MUTATION = gql`
  mutation StartUltraplan($input: StartUltraplanInput!) {
    startUltraplan(input: $input) {
      id
      status
      sessionGroupId
      updatedAt
    }
  }
`;

const PAUSE_ULTRAPLAN_MUTATION = gql`
  mutation PauseUltraplan($id: ID!) {
    pauseUltraplan(id: $id) {
      id
      status
      updatedAt
    }
  }
`;

const RESUME_ULTRAPLAN_MUTATION = gql`
  mutation ResumeUltraplan($id: ID!) {
    resumeUltraplan(id: $id) {
      id
      status
      updatedAt
    }
  }
`;

const RUN_ULTRAPLAN_CONTROLLER_MUTATION = gql`
  mutation RunUltraplanControllerNow($id: ID!) {
    runUltraplanControllerNow(id: $id) {
      id
      status
      createdAt
    }
  }
`;

const CANCEL_ULTRAPLAN_MUTATION = gql`
  mutation CancelUltraplan($id: ID!) {
    cancelUltraplan(id: $id) {
      id
      status
      updatedAt
    }
  }
`;

const terminalStatuses = new Set(["completed", "failed", "cancelled"]);

function normalizeControllerProvider(tool?: string | null): string {
  if (tool === "claude_code" || tool === "codex" || tool === "custom") return tool;
  return "codex";
}

function formatStatus(value: string): string {
  return value.replace(/_/g, " ");
}

function formatTime(value?: string | null): string {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function summaryItems(payload: unknown): string[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const record = payload as Record<string, unknown>;
  const values = [record.actions, record.decisions].flatMap((item) =>
    Array.isArray(item) ? item : [],
  );
  return values
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const objectItem = item as Record<string, unknown>;
        return typeof objectItem.label === "string"
          ? objectItem.label
          : typeof objectItem.title === "string"
            ? objectItem.title
            : typeof objectItem.summary === "string"
              ? objectItem.summary
              : null;
      }
      return null;
    })
    .filter((item): item is string => !!item)
    .slice(0, 3);
}

function errorDescription(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected client error";
}

function ActionButton({
  children,
  disabled,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border px-2 text-[11px] font-medium text-foreground transition-colors hover:bg-surface-elevated disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export function UltraplanPanel({
  sessionGroupId,
  groupName,
  groupBranch,
  groupPrUrl,
  ultraplan,
  controllerSession,
  runtimeInstanceId,
  canInteract,
  onOpenSession,
}: UltraplanPanelProps) {
  const [goal, setGoal] = useState(groupName ? `Finish ${groupName}` : "");
  const [customInstructions, setCustomInstructions] = useState("");
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const tickets = Array.isArray(ultraplan?.tickets) ? ultraplan.tickets : [];
  const ticketExecutions = Array.isArray(ultraplan?.ticketExecutions)
    ? ultraplan.ticketExecutions
    : [];
  const controllerRuns = Array.isArray(ultraplan?.controllerRuns) ? ultraplan.controllerRuns : [];

  const executionsByTicketId = useMemo(() => {
    const map = new Map<string, TicketExecution[]>();
    for (const execution of ticketExecutions) {
      map.set(execution.ticketId, [...(map.get(execution.ticketId) ?? []), execution]);
    }
    return map;
  }, [ticketExecutions]);

  const runMutation = async (name: string, mutation: ReturnType<typeof gql>) => {
    if (!ultraplan) return;
    setPendingAction(name);
    try {
      const result = await client.mutation(mutation, { id: ultraplan.id }).toPromise();
      if (result.error) {
        toast.error(`Failed to ${name} Ultraplan`, { description: result.error.message });
      }
    } catch (error: unknown) {
      toast.error(`Failed to ${name} Ultraplan`, { description: errorDescription(error) });
    } finally {
      setPendingAction(null);
    }
  };

  const handleStart = async () => {
    const trimmedGoal = goal.trim();
    if (!trimmedGoal) return;
    setPendingAction("start");
    const runtimePolicy: Record<string, unknown> = {};
    if (controllerSession?.hosting === "cloud" || controllerSession?.hosting === "local") {
      runtimePolicy.hosting = controllerSession.hosting;
    }
    if (runtimeInstanceId) {
      runtimePolicy.runtimeInstanceId = runtimeInstanceId;
    }
    const input: Record<string, unknown> = {
      sessionGroupId,
      goal: trimmedGoal,
      controllerProvider: normalizeControllerProvider(controllerSession?.tool),
      ...(controllerSession?.model ? { controllerModel: controllerSession.model } : {}),
      ...(Object.keys(runtimePolicy).length > 0 ? { controllerRuntimePolicy: runtimePolicy } : {}),
      ...(customInstructions.trim() ? { customInstructions: customInstructions.trim() } : {}),
    };
    try {
      const result = await client.mutation(START_ULTRAPLAN_MUTATION, { input }).toPromise();
      if (result.error) {
        toast.error("Failed to start Ultraplan", { description: result.error.message });
      }
    } catch (error: unknown) {
      toast.error("Failed to start Ultraplan", { description: errorDescription(error) });
    } finally {
      setPendingAction(null);
    }
  };

  if (!ultraplan) {
    return (
      <div className="space-y-3 p-3">
        <div>
          <div className="text-sm font-semibold text-foreground">Ultraplan</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Coordinate this session group from one ordered plan.
          </div>
        </div>
        <textarea
          value={goal}
          onChange={(event) => setGoal(event.target.value)}
          placeholder="Goal"
          className="h-20 w-full resize-none rounded-md border border-border bg-surface-deep px-2 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-foreground/40"
        />
        <textarea
          value={customInstructions}
          onChange={(event) => setCustomInstructions(event.target.value)}
          placeholder="Optional instructions"
          className="h-16 w-full resize-none rounded-md border border-border bg-surface-deep px-2 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-foreground/40"
        />
        <ActionButton
          disabled={!canInteract || !goal.trim() || pendingAction === "start"}
          onClick={handleStart}
        >
          <Play size={12} />
          Start
        </ActionButton>
      </div>
    );
  }

  const canPause = !terminalStatuses.has(ultraplan.status) && ultraplan.status !== "paused";
  const canResume = ultraplan.status === "paused";
  const canRunNow = !terminalStatuses.has(ultraplan.status);

  return (
    <div className="flex max-h-[min(720px,calc(100vh-5rem))] flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground">Ultraplan</div>
            <div className="mt-1 truncate text-xs text-muted-foreground">
              {ultraplan.planSummary ?? ultraplan.lastControllerSummary ?? "Waiting for a plan summary"}
            </div>
          </div>
          <span className="shrink-0 rounded bg-surface-elevated px-2 py-1 text-[11px] font-medium capitalize text-foreground">
            {formatStatus(ultraplan.status)}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <ActionButton
            disabled={!canInteract || !canPause || pendingAction === "pause"}
            onClick={() => void runMutation("pause", PAUSE_ULTRAPLAN_MUTATION)}
          >
            <Pause size={12} />
            Pause
          </ActionButton>
          <ActionButton
            disabled={!canInteract || !canResume || pendingAction === "resume"}
            onClick={() => void runMutation("resume", RESUME_ULTRAPLAN_MUTATION)}
          >
            <RotateCw size={12} />
            Resume
          </ActionButton>
          <ActionButton
            disabled={!canInteract || !canRunNow || pendingAction === "run controller"}
            onClick={() => void runMutation("run controller", RUN_ULTRAPLAN_CONTROLLER_MUTATION)}
          >
            <FastForward size={12} />
            Run now
          </ActionButton>
          <ActionButton
            disabled={!canInteract || terminalStatuses.has(ultraplan.status) || pendingAction === "cancel"}
            onClick={() => void runMutation("cancel", CANCEL_ULTRAPLAN_MUTATION)}
          >
            <Ban size={12} />
            Cancel
          </ActionButton>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        <section className="space-y-2">
          <div className="text-[11px] font-semibold uppercase text-muted-foreground">Branches</div>
          <div className="grid gap-1.5 text-xs">
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Integration</span>
              <span className="truncate text-foreground">{ultraplan.integrationBranch}</span>
            </div>
            {groupBranch && groupBranch !== ultraplan.integrationBranch && (
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Group</span>
                <span className="truncate text-foreground">{groupBranch}</span>
              </div>
            )}
            {groupPrUrl && (
              <a
                href={groupPrUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-foreground hover:underline"
              >
                Pull request <ExternalLink size={11} />
              </a>
            )}
          </div>
        </section>

        {ultraplan.activeInboxItem && (
          <section className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-100">
            <div className="flex items-center gap-1.5 font-medium">
              <AlertCircle size={12} />
              {ultraplan.activeInboxItem.title}
            </div>
            {ultraplan.activeInboxItem.summary && (
              <div className="mt-1 text-amber-100/80">{ultraplan.activeInboxItem.summary}</div>
            )}
          </section>
        )}

        <section className="space-y-2">
          <div className="text-[11px] font-semibold uppercase text-muted-foreground">Ticket plan</div>
          {tickets.length === 0 ? (
            <div className="rounded-md border border-border p-2 text-xs text-muted-foreground">
              No planned tickets yet.
            </div>
          ) : (
            <div className="space-y-1.5">
              {[...tickets]
                .sort((a, b) => a.position - b.position)
                .map((planned) => {
                  const executions = executionsByTicketId.get(planned.ticketId) ?? [];
                  const latestExecution = executions[executions.length - 1];
                  const dependencies = planned.ticket.dependencies ?? [];
                  return (
                    <div key={planned.id} className="rounded-md border border-border p-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-xs font-medium text-foreground">
                            {planned.position + 1}. {planned.ticket.title}
                          </div>
                          {planned.rationale && (
                            <div className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                              {planned.rationale}
                            </div>
                          )}
                        </div>
                        <span
                          className={cn(
                            "shrink-0 rounded px-1.5 py-0.5 text-[10px] capitalize",
                            planned.status === "blocked"
                              ? "bg-amber-500/15 text-amber-300"
                              : planned.status === "running"
                                ? "bg-emerald-500/15 text-emerald-300"
                                : "bg-surface-elevated text-muted-foreground",
                          )}
                        >
                          {formatStatus(planned.status)}
                        </span>
                      </div>
                      {dependencies.length > 0 && (
                        <div className="mt-1.5 space-y-1 text-[11px] text-muted-foreground">
                          {dependencies.map((dependency) => (
                            <div key={dependency.dependsOnTicketId} className="line-clamp-2">
                              <span className="text-foreground/80">
                                {planned.status === "blocked" ? "Blocked by " : "Depends on "}
                              </span>
                              {dependency.dependsOnTicket.title}
                              {dependency.reason ? `: ${dependency.reason}` : ""}
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="mt-1.5 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                        {latestExecution ? (
                          <>
                            <span>{formatStatus(latestExecution.status)}</span>
                            <span>{latestExecution.branch}</span>
                            {latestExecution.workerSessionId && (
                              <button
                                type="button"
                                onClick={() => onOpenSession(latestExecution.workerSessionId as string)}
                                className="text-foreground hover:underline"
                              >
                                Worker chat
                              </button>
                            )}
                          </>
                        ) : (
                          <span>Planned before execution</span>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </section>

        <section className="space-y-2">
          <div className="text-[11px] font-semibold uppercase text-muted-foreground">
            Controller activity
          </div>
          {controllerRuns.length === 0 ? (
            <div className="rounded-md border border-border p-2 text-xs text-muted-foreground">
              No controller runs yet.
            </div>
          ) : (
            <div className="space-y-1.5">
              {[...controllerRuns]
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .map((run: UltraplanControllerRun) => {
                  const items = summaryItems(run.summaryPayload);
                  return (
                    <div key={run.id} className="rounded-md border border-border p-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-xs font-medium text-foreground">
                            {run.summaryTitle ?? run.inputSummary ?? run.triggerType}
                          </div>
                          <div className="mt-1 text-[11px] text-muted-foreground">
                            {run.summary ?? run.error ?? "Run summary pending"}
                          </div>
                        </div>
                        <span className="shrink-0 text-[10px] capitalize text-muted-foreground">
                          {formatStatus(run.status)}
                        </span>
                      </div>
                      {items.length > 0 && (
                        <div className="mt-1.5 space-y-0.5 text-[11px] text-muted-foreground">
                          {items.map((item) => (
                            <div key={item} className="truncate">
                              {item}
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                        <span>{formatTime(run.completedAt ?? run.startedAt ?? run.createdAt)}</span>
                        {run.sessionId && (
                          <button
                            type="button"
                            onClick={() => onOpenSession(run.sessionId as string)}
                            className="text-foreground hover:underline"
                          >
                            Full chat
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
