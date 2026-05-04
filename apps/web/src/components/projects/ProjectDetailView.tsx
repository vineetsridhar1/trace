import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ArrowLeft, CalendarClock, GitBranch, Radio, RefreshCw, Send, Users } from "lucide-react";
import { gql } from "@urql/core";
import type { Project } from "@trace/gql";
import { useShallow } from "zustand/react/shallow";
import {
  eventScopeKey,
  type ProjectRunEntity,
  useActiveProjectRunId,
  useAuthStore,
  useEntityField,
  useEntityStore,
  useScopedEventIds,
} from "@trace/client-core";
import { useProjectEvents } from "../../hooks/useProjectEvents";
import { useUIStore } from "../../stores/ui";
import { client } from "../../lib/urql";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { Textarea } from "../ui/textarea";

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
      }
      tickets {
        id
        title
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

const RECORD_PROJECT_ANSWER_MUTATION = gql`
  mutation RecordProjectAnswer($input: RecordProjectPlanningMessageInput!) {
    recordProjectAnswer(input: $input) {
      id
    }
  }
`;

const PLANNING_EVENT_TYPES = new Set([
  "project_question_asked",
  "project_answer_recorded",
  "project_decision_recorded",
  "project_risk_recorded",
]);

export function ProjectDetailView({ projectId }: { projectId: string }) {
  const activeOrgId = useAuthStore((s: { activeOrgId: string | null }) => s.activeOrgId);
  const upsert = useEntityStore((s) => s.upsert);
  const upsertMany = useEntityStore((s) => s.upsertMany);
  const setActiveProjectId = useUIStore((s) => s.setActiveProjectId);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const projectName = useEntityField("projects", projectId, "name");
  const project = useEntityStore((s) => s.projects[projectId]);
  const activeProjectRunId = useActiveProjectRunId(projectId);
  const activeProjectRun = useEntityStore((s) =>
    activeProjectRunId ? s.projectRuns[activeProjectRunId] : null,
  );
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

      <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="space-y-4">
          {activeProjectRun && (
            <ProjectRunPanel
              projectRun={activeProjectRun}
              scopeKey={scopeKey}
              eventIds={eventIds}
            />
          )}

          <div className="rounded-md border border-border bg-background p-4">
            <h2 className="text-sm font-semibold text-foreground">Overview</h2>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
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
        </section>

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
      </div>
    </div>
  );
}

function ProjectRunPanel({
  projectRun,
  scopeKey,
  eventIds,
}: {
  projectRun: ProjectRunEntity;
  scopeKey: string;
  eventIds: string[];
}) {
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const planningEvents = useEntityStore(
    useShallow((s) =>
      eventIds
        .map((id) => s.eventsByScope[scopeKey]?.[id])
        .filter((event): event is NonNullable<typeof event> => {
          if (!event || !PLANNING_EVENT_TYPES.has(event.eventType)) return false;
          const payload = asRecord(event.payload);
          return payload?.projectRunId === projectRun.id;
        }),
    ),
  );

  const submitAnswer = useCallback(async () => {
    const message = answer.trim();
    if (!message || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    const result = await client
      .mutation(RECORD_PROJECT_ANSWER_MUTATION, {
        input: { projectRunId: projectRun.id, message },
      })
      .toPromise();
    setSubmitting(false);
    if (result.error) {
      setSubmitError(result.error.message);
      return;
    }
    setAnswer("");
  }, [answer, projectRun.id, submitting]);

  return (
    <div className="rounded-md border border-accent/30 bg-surface-elevated p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">Planning run</h2>
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
      <div className="mt-4 border-t border-border pt-4">
        <div className="text-xs font-medium uppercase text-muted-foreground">
          Planning conversation
        </div>
        {planningEvents.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Trace is preparing the first planning question.
          </p>
        ) : (
          <div className="mt-2 space-y-2">
            {planningEvents.map((event) => (
              <PlanningEventItem
                key={event.id}
                eventType={event.eventType}
                payload={event.payload}
              />
            ))}
          </div>
        )}
        <div className="mt-3 space-y-2">
          <Textarea
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            placeholder="Answer the latest planning question..."
            className="min-h-20 resize-none"
          />
          {submitError && <p className="text-xs text-destructive">{submitError}</p>}
          <div className="flex justify-end">
            <Button size="sm" onClick={submitAnswer} disabled={!answer.trim() || submitting}>
              <Send size={14} />
              {submitting ? "Sending..." : "Send answer"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlanningEventItem({
  eventType,
  payload,
}: {
  eventType: string;
  payload: unknown;
}) {
  const text = planningEventText(eventType, asRecord(payload) ?? {});
  if (!text) return null;

  return (
    <div className="rounded-md border border-border bg-background/70 p-3">
      <div className="text-xs font-medium uppercase text-muted-foreground">
        {planningEventLabel(eventType)}
      </div>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-foreground">{text}</p>
    </div>
  );
}

function planningEventLabel(eventType: string): string {
  if (eventType === "project_question_asked") return "Trace asked";
  if (eventType === "project_answer_recorded") return "You answered";
  if (eventType === "project_decision_recorded") return "Decision";
  if (eventType === "project_risk_recorded") return "Risk";
  return formatStatus(eventType);
}

function planningEventText(eventType: string, payload: Record<string, unknown>): string | null {
  if (eventType === "project_question_asked" || eventType === "project_answer_recorded") {
    return typeof payload.message === "string" ? payload.message : null;
  }
  if (eventType === "project_decision_recorded") {
    return typeof payload.decision === "string" ? payload.decision : null;
  }
  if (eventType === "project_risk_recorded") {
    return typeof payload.risk === "string" ? payload.risk : null;
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
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
