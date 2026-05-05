import { useCallback, useRef, useState } from "react";
import { AlertCircle, ListChecks, Loader2, Play } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { gql } from "@urql/core";
import { useEntityStore } from "@trace/client-core";
import { useShallow } from "zustand/react/shallow";
import { client } from "../../lib/urql";
import { usePreferencesStore } from "../../stores/preferences";
import { Button } from "../ui/button";
import { getDefaultModel } from "../session/modelOptions";
import { TicketDetailPanel } from "../tickets/TicketDetailPanel";
import { ProjectTicketRow } from "./ProjectTicketRow";
import { useProjectTicketIds } from "./useProjectTicketIds";

const ROW_HEIGHT = 52;

const BLOCKING_EXECUTION_STATUSES = new Set([
  "queued",
  "ready",
  "running",
  "reviewing",
  "fixing",
  "needs_human",
  "blocked",
]);

const START_PROJECT_TICKET_EXECUTION_MUTATION = gql`
  mutation StartProjectTicketExecution($input: StartProjectTicketExecutionInput!) {
    startProjectTicketExecution(input: $input) {
      id
    }
  }
`;

export function ProjectTicketList({
  projectId,
  projectRunId,
}: {
  projectId: string;
  projectRunId: string | null;
}) {
  const ticketIds = useProjectTicketIds(projectId);
  const defaultTool = usePreferencesStore((s) => s.defaultTool);
  const defaultModel = usePreferencesStore((s) => s.defaultModel);
  const generationAttempt = useEntityStore((state) => {
    if (!projectRunId) return null;
    return (
      Object.values(state.projectTicketGenerationAttempts).find(
        (attempt) => attempt.projectRunId === projectRunId,
      ) ?? null
    );
  });
  const blockingExecution = useEntityStore(
    useShallow((state) => {
      if (!projectRunId) return null;
      return (
        Object.values(state.projectTicketExecutions)
          .filter(
            (execution) =>
              execution.projectRunId === projectRunId &&
              BLOCKING_EXECUTION_STATUSES.has(execution.status),
          )
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null
      );
    }),
  );
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [startingExecution, setStartingExecution] = useState(false);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer({
    count: ticketIds.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 6,
  });

  const handleSelect = useCallback((ticketId: string) => {
    setSelectedTicketId((current) => (current === ticketId ? null : ticketId));
  }, []);

  const canStartNext =
    Boolean(projectRunId) &&
    ticketIds.length > 0 &&
    !blockingExecution &&
    generationAttempt?.status !== "running" &&
    generationAttempt?.status !== "pending";

  const handleStartNext = useCallback(async () => {
    if (!projectRunId || startingExecution) return;
    setStartingExecution(true);
    setExecutionError(null);

    const tool = defaultTool ?? "claude_code";
    const result = await client
      .mutation(START_PROJECT_TICKET_EXECUTION_MUTATION, {
        input: {
          projectRunId,
          tool,
          model: defaultModel ?? getDefaultModel(tool),
        },
      })
      .toPromise();

    if (result.error) {
      setExecutionError(result.error.message);
    }
    setStartingExecution(false);
  }, [defaultModel, defaultTool, projectRunId, startingExecution]);

  return (
    <section className="relative flex min-h-0 flex-1 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4">
        <ListChecks size={15} className="text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Tickets</h2>
        <span className="ml-auto text-xs text-muted-foreground">{ticketIds.length}</span>
        <Button
          size="sm"
          className="h-7 px-2 text-xs"
          disabled={!canStartNext || startingExecution}
          onClick={handleStartNext}
        >
          {startingExecution ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
          Start next
        </Button>
      </div>

      {generationAttempt ? (
        <GenerationAttemptNotice
          status={generationAttempt.status}
          error={generationAttempt.error ?? null}
          draftCount={generationAttempt.draftCount}
        />
      ) : null}

      {blockingExecution ? (
        <ExecutionNotice
          status={blockingExecution.status}
          ticketId={blockingExecution.ticketId}
          hasSession={Boolean(blockingExecution.implementationSessionId)}
        />
      ) : executionError ? (
        <div className="flex shrink-0 items-start gap-2 border-b border-border bg-destructive/5 px-4 py-2 text-xs text-destructive">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <p className="min-w-0 break-words">{executionError}</p>
        </div>
      ) : null}

      {ticketIds.length === 0 ? (
        <div className="flex min-h-[180px] flex-1 items-center justify-center px-5 text-center">
          <p className="max-w-xs text-sm text-muted-foreground">
            Approve the plan to generate project tickets. Generated and manually linked tickets
            appear here from service-created events.
          </p>
        </div>
      ) : (
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const ticketId = ticketIds[virtualRow.index];
              if (!ticketId) return null;
              return (
                <div
                  key={ticketId}
                  className="absolute left-0 top-0 w-full"
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  <ProjectTicketRow
                    ticketId={ticketId}
                    selected={selectedTicketId === ticketId}
                    onSelect={handleSelect}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      <TicketDetailPanel ticketId={selectedTicketId} onClose={() => setSelectedTicketId(null)} />
    </section>
  );
}

function ExecutionNotice({
  status,
  ticketId,
  hasSession,
}: {
  status: string;
  ticketId: string;
  hasSession: boolean;
}) {
  return (
    <div className="flex shrink-0 items-start gap-2 border-b border-border bg-surface px-4 py-2 text-xs text-muted-foreground">
      <Loader2 size={14} className="mt-0.5 shrink-0 animate-spin text-accent" />
      <div className="min-w-0">
        <p className="font-medium text-foreground">
          {hasSession ? "Executing project ticket" : "Starting ticket execution"}
        </p>
        <p className="mt-0.5 break-words">
          {hasSession
            ? "The implementation session is open on the right."
            : "Trace is creating the implementation session."}{" "}
          Ticket {ticketId.slice(0, 8)} is {status.replace(/_/g, " ")}.
        </p>
      </div>
    </div>
  );
}

function GenerationAttemptNotice({
  status,
  error,
  draftCount,
}: {
  status: string;
  error: string | null;
  draftCount: number;
}) {
  if (status === "completed") return null;

  const running = status === "running";
  return (
    <div className="flex shrink-0 items-start gap-2 border-b border-border bg-surface px-4 py-2 text-xs text-muted-foreground">
      {running ? (
        <Loader2 size={14} className="mt-0.5 shrink-0 animate-spin text-accent" />
      ) : (
        <AlertCircle size={14} className="mt-0.5 shrink-0 text-destructive" />
      )}
      <div className="min-w-0">
        <p className="font-medium text-foreground">
          {running
            ? "Generating project tickets"
            : status === "partial_failed"
              ? `Generated ${draftCount} draft${draftCount === 1 ? "" : "s"} with issues`
              : status === "pending"
                ? "Ticket generation is pending"
                : "Ticket generation needs attention"}
        </p>
        {running ? (
          <p className="mt-0.5">
            The planning AI session on the right is running the injected ticket CLI.
          </p>
        ) : null}
        {error ? <p className="mt-0.5 break-words">{error}</p> : null}
      </div>
    </div>
  );
}
