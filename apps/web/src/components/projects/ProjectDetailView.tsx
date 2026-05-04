import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  CalendarClock,
  GitBranch,
  Loader2,
  MessageSquare,
  RefreshCw,
} from "lucide-react";
import { gql } from "@urql/core";
import type { Project, Ticket } from "@trace/gql";
import {
  type ProjectRunEntity,
  type SessionEntity,
  useActiveProjectRunId,
  useAuthStore,
  useEntityField,
  useEntityStore,
} from "@trace/client-core";
import { useUIStore } from "../../stores/ui";
import { usePreferencesStore } from "../../stores/preferences";
import { client } from "../../lib/urql";
import { SessionDetailView } from "../session/SessionDetailView";
import { getDefaultModel } from "../session/modelOptions";
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
        projects {
          id
          name
          organizationId
          repoId
          aiMode
          soulFile
          createdAt
          updatedAt
        }
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
        planningSessionId
        activeGateId
        latestControllerSummaryId
        latestControllerSummaryText
        executionConfig
        playbookVersionId
        playbookSnapshot
        createdAt
        updatedAt
      }
      createdAt
      updatedAt
    }
  }
`;

const START_PROJECT_PLANNING_SESSION_MUTATION = gql`
  mutation StartProjectPlanningSession($input: StartProjectPlanningSessionInput!) {
    startProjectPlanningSession(input: $input) {
      id
      name
      agentStatus
      sessionStatus
      updatedAt
      createdAt
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
  const [autoStartedRunId, setAutoStartedRunId] = useState<string | null>(null);
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
  const planningSession = project
    ? selectPlanningSession(project.sessions, currentProjectRun?.planningSessionId)
    : null;
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
      .mutation(START_PROJECT_PLANNING_SESSION_MUTATION, {
        input: {
          projectRunId: currentProjectRun.id,
          tool,
          model: defaultModel ?? getDefaultModel(tool),
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
    startingSession,
  ]);

  useEffect(() => {
    if (!project || !currentProjectRun || planningSession || startingSession) return;
    if (autoStartedRunId === currentProjectRun.id) return;
    setAutoStartedRunId(currentProjectRun.id);
    void startInterviewerSession();
  }, [
    autoStartedRunId,
    currentProjectRun,
    planningSession,
    project,
    startInterviewerSession,
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

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
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
                <CalendarClock size={14} />
                Updated {formatDateTime(project.updatedAt)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 bg-surface">
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
      </div>
    </div>
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
        {error ? (
          <Button className="mt-4" onClick={onStart} disabled={!canStart || starting}>
            {starting ? <Loader2 size={16} className="animate-spin" /> : null}
            Retry
          </Button>
        ) : (
          <div className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 size={16} className="animate-spin" />
            Starting planning chat
          </div>
        )}
      </div>
    </div>
  );
}

function selectPlanningSession(
  sessions: Project["sessions"],
  planningSessionId?: string | null,
): Project["sessions"][number] | null {
  const linked = planningSessionId
    ? sessions.find((session) => session.id === planningSessionId)
    : null;
  if (linked) return linked;
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

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
