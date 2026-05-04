import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  CalendarClock,
  FileText,
  GitBranch,
  ListChecks,
  Loader2,
  MessageSquare,
  Radio,
  RefreshCw,
  Users,
} from "lucide-react";
import { gql } from "@urql/core";
import type { Project, Ticket } from "@trace/gql";
import { useShallow } from "zustand/react/shallow";
import {
  eventScopeKey,
  type ProjectRunEntity,
  START_SESSION_MUTATION,
  type SessionEntity,
  useActiveProjectRunId,
  useAuthStore,
  useEntityField,
  useEntityStore,
  useScopedEventIds,
} from "@trace/client-core";
import { useProjectEvents } from "../../hooks/useProjectEvents";
import { useUIStore } from "../../stores/ui";
import { usePreferencesStore } from "../../stores/preferences";
import { client } from "../../lib/urql";
import { buildPlanningSessionPrompt } from "../../lib/projectPlanningSessionPrompt";
import { SessionDetailView } from "../session/SessionDetailView";
import { getDefaultModel } from "../session/modelOptions";
import { ticketPriorityLabel, ticketStatusLabel } from "../tickets/tickets-table-types";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";

const ACTIVE_PROJECT_RUN_STATUSES = new Set([
  "draft",
  "interviewing",
  "planning",
  "ready",
  "running",
  "needs_human",
  "paused",
]);

const PROJECT_QUERY = gql`
  query Project($id: ID!) {
    project(id: $id) {
      id
      name
      organizationId
      repoId
      repo {
        id
        name
        remoteUrl
        defaultBranch
        webhookActive
      }
      aiMode
      soulFile
      members {
        user {
          id
          email
          name
          avatarUrl
        }
        role
        joinedAt
        leftAt
      }
      channels {
        id
        name
      }
      sessions {
        id
        name
        agentStatus
        sessionStatus
        updatedAt
        createdAt
      }
      tickets {
        id
        title
        description
        status
        priority
        labels
        assignees {
          id
          name
          avatarUrl
        }
        createdBy {
          id
          name
          avatarUrl
        }
        channel {
          id
        }
        createdAt
        updatedAt
      }
      runs {
        id
        organizationId
        projectId
        status
        initialGoal
        planSummary
        activeGateId
        latestControllerSummaryId
        latestControllerSummaryText
        executionConfig
        createdAt
        updatedAt
      }
      createdAt
      updatedAt
    }
  }
`;

export function ProjectDetailView({ projectId }: { projectId: string }) {
  const activeOrgId = useAuthStore((s: { activeOrgId: string | null }) => s.activeOrgId);
  const upsert = useEntityStore((s) => s.upsert);
  const upsertMany = useEntityStore((s) => s.upsertMany);
  const setActiveProjectId = useUIStore((s) => s.setActiveProjectId);
  const defaultTool = usePreferencesStore((s) => s.defaultTool);
  const defaultModel = usePreferencesStore((s) => s.defaultModel);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startingSession, setStartingSession] = useState(false);
  const [startSessionError, setStartSessionError] = useState<string | null>(null);
  const projectName = useEntityField("projects", projectId, "name");
  const project = useEntityStore((s) => s.projects[projectId]);
  const activeProjectRunId = useActiveProjectRunId(projectId);
  const activeProjectRun = useEntityStore((s) =>
    activeProjectRunId ? s.projectRuns[activeProjectRunId] : null,
  );
  const currentProjectRun =
    activeProjectRun ??
    selectActiveProjectRun((project?.runs ?? []) as Array<ProjectRunEntity & { id: string }>);
  const scopeKey = useMemo(() => eventScopeKey("project", projectId), [projectId]);
  const eventIds = useScopedEventIds(scopeKey);
  const projectEvents = useProjectEvents(projectId);

  const fetchProject = useCallback(async () => {
    setError(null);
    const result = await client.query(PROJECT_QUERY, { id: projectId }).toPromise();
    if (result.error) {
      setError(result.error.message);
      setLoading(false);
      return;
    }
    const fetched = result.data?.project as (Project & { id: string }) | null | undefined;
    if (fetched && (!activeOrgId || fetched.organizationId === activeOrgId)) {
      upsert("projects", fetched.id, fetched);
      upsertMany("projectRuns", fetched.runs as Array<ProjectRunEntity & { id: string }>);
      upsertMany("sessions", fetched.sessions as Array<SessionEntity & { id: string }>);
      upsertMany("tickets", fetched.tickets as Array<Ticket & { id: string }>);
      setNotFound(false);
    } else {
      setNotFound(true);
    }
    setLoading(false);
  }, [activeOrgId, projectId, upsert, upsertMany]);

  useEffect(() => {
    setLoading(true);
    setNotFound(false);
    setError(null);
    fetchProject();
  }, [fetchProject]);

  const startInterviewerSession = useCallback(async () => {
    if (!currentProjectRun || startingSession) return;
    setStartingSession(true);
    setStartSessionError(null);
    const tool = defaultTool ?? "claude_code";
    const result = await client
      .mutation(START_SESSION_MUTATION, {
        input: {
          tool,
          model: defaultModel ?? getDefaultModel(tool),
          repoId: project?.repoId ?? undefined,
          projectId,
          prompt: buildPlanningSessionPrompt(currentProjectRun.initialGoal),
          interactionMode: "plan",
        },
      })
      .toPromise();

    if (result.error) {
      setStartSessionError(result.error.message);
      setStartingSession(false);
      return;
    }

    await fetchProject();
    setStartingSession(false);
  }, [
    currentProjectRun,
    defaultModel,
    defaultTool,
    fetchProject,
    project?.repoId,
    projectId,
    startingSession,
  ]);

  if (loading && !project) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-8 w-56 rounded-md" />
        <Skeleton className="h-28 w-full rounded-md" />
        <Skeleton className="h-40 w-full rounded-md" />
      </div>
    );
  }

  if (error && !project) {
    return (
      <ProjectDetailState
        title="Project failed to load"
        body={error}
        action={
          <Button variant="outline" onClick={fetchProject}>
            <RefreshCw size={16} />
            Retry
          </Button>
        }
      />
    );
  }

  if (notFound || !project) {
    return (
      <ProjectDetailState
        title="Project not found"
        body="This project may have been removed or may not belong to the active organization."
        action={
          <Button variant="outline" onClick={() => setActiveProjectId(null)}>
            Back to projects
          </Button>
        }
      />
    );
  }

  const members = project.members.filter((member) => !member.leftAt);
  const planningSession = selectPlanningSession(project.sessions);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="border-b border-border px-4 py-3">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2"
          onClick={() => setActiveProjectId(null)}
        >
          <ArrowLeft size={16} />
          Projects
        </Button>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold text-foreground">{projectName}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <GitBranch size={14} />
                {project.repo?.name ?? "No repo"}
              </span>
              <span className="inline-flex items-center gap-1">
                <Users size={14} />
                {members.length} {members.length === 1 ? "member" : "members"}
              </span>
              <span className="inline-flex items-center gap-1">
                <CalendarClock size={14} />
                Updated {formatDateTime(project.updatedAt)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="flex h-[calc(100vh-176px)] min-h-[620px] flex-col overflow-hidden rounded-md border border-border bg-background">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <MessageSquare size={16} className="shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold text-foreground">
                  Interviewer session
                </h2>
                <p className="truncate text-xs text-muted-foreground">
                  {planningSession?.name ?? "Normal project-linked session"}
                </p>
              </div>
            </div>
            {!planningSession && (
              <Button
                size="sm"
                variant="outline"
                onClick={startInterviewerSession}
                disabled={!currentProjectRun || startingSession}
              >
                {startingSession ? <Loader2 size={14} className="animate-spin" /> : null}
                Start interviewer
              </Button>
            )}
          </div>

          {planningSession ? (
            <SessionDetailView
              sessionId={planningSession.id}
              panelMode
              hideHeader
              projectPlanningContext={
                currentProjectRun
                  ? {
                      organizationId: project.organizationId,
                      projectId: project.id,
                      projectRunId: currentProjectRun.id,
                      onPlanApproved: fetchProject,
                    }
                  : null
              }
            />
          ) : (
            <ProjectSessionEmptyState
              error={startSessionError}
              starting={startingSession}
              canStart={Boolean(currentProjectRun)}
              onStart={startInterviewerSession}
            />
          )}
        </section>

        <aside className="space-y-4">
          {currentProjectRun && <ProjectRunPanel projectRun={currentProjectRun} />}
          <ProjectTicketsPanel tickets={project.tickets} />

          <div className="rounded-md border border-border bg-background p-4">
            <h2 className="text-sm font-semibold text-foreground">Overview</h2>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-1">
              <DetailItem label="Repository" value={project.repo?.name ?? "Not linked"} />
              <DetailItem label="Default branch" value={project.repo?.defaultBranch ?? "Not set"} />
              <DetailItem label="Channels" value={String(project.channels.length)} />
              <DetailItem label="Sessions" value={String(project.sessions.length)} />
              <DetailItem label="Tickets" value={String(project.tickets.length)} />
              <DetailItem label="AI mode" value={project.aiMode ?? "Inherited"} />
            </dl>
          </div>

          <div className="rounded-md border border-border bg-background p-4">
            <h2 className="text-sm font-semibold text-foreground">Members</h2>
            <div className="mt-3 divide-y divide-border">
              {members.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">No active project members.</p>
              ) : (
                members.map((member) => (
                  <div key={member.user.id} className="flex items-center gap-3 py-2">
                    <div className="flex size-8 items-center justify-center rounded-full bg-accent/10 text-xs font-semibold text-accent">
                      {(member.user.name ?? member.user.email).slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-foreground">
                        {member.user.name ?? member.user.email}
                      </div>
                      <div className="text-xs text-muted-foreground">{member.role}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <section className="rounded-md border border-border bg-background p-4">
            <div className="flex items-center gap-2">
              <Radio size={15} className="text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">Latest activity</h2>
            </div>
            <ProjectActivityList
              scopeKey={scopeKey}
              eventIds={eventIds}
              loading={projectEvents.loading}
              error={projectEvents.error}
            />
          </section>
        </aside>
      </div>
    </div>
  );
}

function ProjectRunPanel({ projectRun }: { projectRun: ProjectRunEntity }) {
  return (
    <section className="rounded-md border border-accent/30 bg-surface-elevated p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileText size={15} className="text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Plan</h2>
        </div>
        <span className="rounded-md bg-accent/10 px-2 py-1 text-xs font-medium text-accent">
          {formatStatus(projectRun.status)}
        </span>
      </div>
      <div className="mt-3">
        <div className="text-xs font-medium uppercase text-muted-foreground">Initial goal</div>
        <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-foreground">
          {projectRun.initialGoal}
        </p>
      </div>
      <div className="mt-3">
        <div className="text-xs font-medium uppercase text-muted-foreground">Plan summary</div>
        <p className="mt-1 text-sm text-muted-foreground">
          {projectRun.planSummary || "Planning has not produced a summary yet."}
        </p>
      </div>
    </section>
  );
}

function ProjectTicketsPanel({ tickets }: { tickets: Project["tickets"] }) {
  const sortedTickets = [...tickets].sort((a, b) =>
    sortableDate(b.updatedAt).localeCompare(sortableDate(a.updatedAt)),
  );

  return (
    <section className="rounded-md border border-border bg-background p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ListChecks size={15} className="text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Tickets</h2>
        </div>
        <span className="text-xs text-muted-foreground">{tickets.length}</span>
      </div>

      {sortedTickets.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Approved plans will create linked project tickets here.
        </p>
      ) : (
        <div className="mt-3 max-h-80 divide-y divide-border overflow-y-auto">
          {sortedTickets.map((ticket) => (
            <div key={ticket.id} className="py-3 first:pt-0 last:pb-0">
              <div className="line-clamp-2 text-sm font-medium text-foreground">
                {ticket.title ?? "Untitled ticket"}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground">
                  {ticket.status
                    ? (ticketStatusLabel[ticket.status] ?? formatStatus(ticket.status))
                    : "Status pending"}
                </span>
                <span className="rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground">
                  {ticket.priority
                    ? (ticketPriorityLabel[ticket.priority] ?? formatStatus(ticket.priority))
                    : "Priority pending"}
                </span>
                {(ticket.assignees?.length ?? 0) > 0 && (
                  <span className="truncate text-xs text-muted-foreground">
                    {ticket.assignees.map((assignee) => assignee.name ?? assignee.id).join(", ")}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ProjectSessionEmptyState({
  error,
  starting,
  canStart,
  onStart,
}: {
  error: string | null;
  starting: boolean;
  canStart: boolean;
  onStart: () => void;
}) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <MessageSquare size={28} className="mx-auto text-muted-foreground" />
        <h3 className="mt-3 text-base font-semibold text-foreground">No interviewer session</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Start a normal project session to interview the user and draft the plan.
        </p>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        <Button className="mt-4" onClick={onStart} disabled={!canStart || starting}>
          {starting ? <Loader2 size={16} className="animate-spin" /> : null}
          Start interviewer
        </Button>
      </div>
    </div>
  );
}

function selectPlanningSession(sessions: Project["sessions"]): Project["sessions"][number] | null {
  if (sessions.length === 0) return null;
  return (
    [...sessions].sort((a, b) =>
      sortableDate(b.updatedAt).localeCompare(sortableDate(a.updatedAt)),
    )[0] ?? null
  );
}

function selectActiveProjectRun(
  runs: Array<ProjectRunEntity & { id: string }>,
): (ProjectRunEntity & { id: string }) | null {
  if (runs.length === 0) return null;
  return (
    runs
      .filter((run) => ACTIVE_PROJECT_RUN_STATUSES.has(run.status))
      .sort((a, b) => sortableDate(b.updatedAt).localeCompare(sortableDate(a.updatedAt)))[0] ??
    null
  );
}

function sortableDate(value: string | null | undefined): string {
  return typeof value === "string" ? value : "";
}

function ProjectDetailState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action: ReactNode;
}) {
  return (
    <div className="flex flex-1 items-center justify-center px-6">
      <div className="max-w-sm text-center">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{body}</p>
        <div className="mt-4">{action}</div>
      </div>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase text-muted-foreground">{label}</dt>
      <dd className="mt-1 truncate text-foreground">{value}</dd>
    </div>
  );
}

function ProjectActivityList({
  scopeKey,
  eventIds,
  loading,
  error,
}: {
  scopeKey: string;
  eventIds: string[];
  loading: boolean;
  error: string | null;
}) {
  const events = useEntityStore(
    useShallow((s) =>
      eventIds
        .slice(-8)
        .reverse()
        .map((id) => s.eventsByScope[scopeKey]?.[id])
        .filter((event): event is NonNullable<typeof event> => event !== undefined),
    ),
  );

  if (error) {
    return <p className="mt-3 text-sm text-destructive">{error}</p>;
  }

  if (loading && events.length === 0) {
    return <p className="mt-3 text-sm text-muted-foreground">Loading activity...</p>;
  }

  if (events.length === 0) {
    return <p className="mt-3 text-sm text-muted-foreground">No project activity received yet.</p>;
  }

  return (
    <div className="mt-3 divide-y divide-border">
      {events.map((event) => (
        <div key={event.id} className="py-2">
          <div className="text-sm font-medium text-foreground">{event.eventType}</div>
          <div className="text-xs text-muted-foreground">{formatDateTime(event.timestamp)}</div>
        </div>
      ))}
    </div>
  );
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatStatus(value: string): string {
  return value.replace(/_/g, " ");
}
