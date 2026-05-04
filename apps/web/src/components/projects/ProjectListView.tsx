import { useCallback, useEffect, useState } from "react";
import { FolderKanban, GitBranch, Users } from "lucide-react";
import { gql } from "@urql/core";
import type { Project } from "@trace/gql";
import { useAuthStore, useEntityIds, useEntityStore } from "@trace/client-core";
import { useUIStore } from "../../stores/ui";
import { client } from "../../lib/urql";
import { cn } from "../../lib/utils";
import { Skeleton } from "../ui/skeleton";

const PROJECTS_QUERY = gql`
  query Projects($organizationId: ID!) {
    projects(organizationId: $organizationId) {
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
      }
      sessions {
        id
      }
      tickets {
        id
      }
      createdAt
      updatedAt
    }
  }
`;

export function ProjectListView() {
  const activeOrgId = useAuthStore((s: { activeOrgId: string | null }) => s.activeOrgId);
  const upsertMany = useEntityStore((s) => s.upsertMany);
  const setActiveProjectId = useUIStore((s) => s.setActiveProjectId);
  const [loading, setLoading] = useState(true);

  const fetchProjects = useCallback(async () => {
    if (!activeOrgId) return;
    const result = await client.query(PROJECTS_QUERY, { organizationId: activeOrgId }).toPromise();
    if (result.data?.projects) {
      upsertMany("projects", result.data.projects as Array<Project & { id: string }>);
    }
    setLoading(false);
  }, [activeOrgId, upsertMany]);

  useEffect(() => {
    setLoading(true);
    fetchProjects();
  }, [fetchProjects]);

  const projectIds = useEntityIds(
    "projects",
    (project) => project.organizationId === activeOrgId,
    (a, b) => b.updatedAt.localeCompare(a.updatedAt),
  );

  if (loading) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-20 w-full rounded-md" />
        ))}
      </div>
    );
  }

  if (projectIds.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-6">
        <div className="max-w-sm text-center">
          <FolderKanban className="mx-auto mb-3 text-muted-foreground" size={28} />
          <h3 className="text-base font-semibold text-foreground">No projects yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Start by creating a project from the service layer or seed data, then it will appear
            here as a workspace.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <div className="grid gap-2">
        {projectIds.map((id) => (
          <ProjectListItem key={id} projectId={id} onOpen={setActiveProjectId} />
        ))}
      </div>
    </div>
  );
}

function ProjectListItem({
  projectId,
  onOpen,
}: {
  projectId: string;
  onOpen: (id: string) => void;
}) {
  const project = useEntityStore((s) => s.projects[projectId]);
  if (!project) return null;

  const memberCount = project.members.filter((member) => !member.leftAt).length;
  const updatedAt = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(project.updatedAt));

  return (
    <button
      type="button"
      onClick={() => onOpen(project.id)}
      className={cn(
        "flex min-h-20 w-full items-center gap-3 rounded-md border border-border bg-background px-3 py-3 text-left transition-colors",
        "hover:border-accent/40 hover:bg-surface-elevated",
      )}
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent">
        <FolderKanban size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-foreground">{project.name}</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <GitBranch size={13} />
            {project.repo?.name ?? "No repo"}
          </span>
          <span className="inline-flex items-center gap-1">
            <Users size={13} />
            {memberCount} {memberCount === 1 ? "member" : "members"}
          </span>
          <span>Updated {updatedAt}</span>
        </div>
      </div>
      <span className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground">
        Open
      </span>
    </button>
  );
}
