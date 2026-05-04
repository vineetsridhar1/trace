import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarClock, GitBranch, Radio, Users } from "lucide-react";
import { gql } from "@urql/core";
import type { Project } from "@trace/gql";
import {
  eventScopeKey,
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
      createdAt
      updatedAt
    }
  }
`;

export function ProjectDetailView({ projectId }: { projectId: string }) {
  const activeOrgId = useAuthStore((s: { activeOrgId: string | null }) => s.activeOrgId);
  const upsert = useEntityStore((s) => s.upsert);
  const setActiveProjectId = useUIStore((s) => s.setActiveProjectId);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const projectName = useEntityField("projects", projectId, "name");
  const project = useEntityStore((s) => s.projects[projectId]);
  const scopeKey = useMemo(() => eventScopeKey("project", projectId), [projectId]);
  const eventIds = useScopedEventIds(scopeKey);
  useProjectEvents(projectId);

  const fetchProject = useCallback(async () => {
    const result = await client.query(PROJECT_QUERY, { id: projectId }).toPromise();
    const fetched = result.data?.project as (Project & { id: string }) | null | undefined;
    if (fetched && (!activeOrgId || fetched.organizationId === activeOrgId)) {
      upsert("projects", fetched.id, fetched);
      setNotFound(false);
    } else {
      setNotFound(true);
    }
    setLoading(false);
  }, [activeOrgId, projectId, upsert]);

  useEffect(() => {
    setLoading(true);
    setNotFound(false);
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

  if (notFound || !project) {
    return (
      <div className="flex flex-1 items-center justify-center px-6">
        <div className="max-w-sm text-center">
          <h3 className="text-base font-semibold text-foreground">Project not found</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            This project may have been removed or may not belong to the active organization.
          </p>
          <Button className="mt-4" variant="outline" onClick={() => setActiveProjectId(null)}>
            Back to projects
          </Button>
        </div>
      </div>
    );
  }

  const members = project.members.filter((member) => !member.leftAt);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="border-b border-border px-4 py-3">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={() => setActiveProjectId(null)}>
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
          <ProjectActivityList scopeKey={scopeKey} eventIds={eventIds} />
        </section>
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

function ProjectActivityList({ scopeKey, eventIds }: { scopeKey: string; eventIds: string[] }) {
  const events = useEntityStore((s) =>
    eventIds
      .slice(-8)
      .reverse()
      .map((id) => s.eventsByScope[scopeKey]?.[id])
      .filter((event): event is NonNullable<typeof event> => event !== undefined),
  );

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
