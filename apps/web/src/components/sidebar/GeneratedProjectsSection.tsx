import { useEffect, useMemo } from "react";
import { Plus } from "lucide-react";
import { gql } from "@urql/core";
import type { Session, SessionGroup } from "@trace/gql";
import { useEntityStore, type SessionEntity, type SessionGroupEntity } from "@trace/client-core";
import { client } from "../../lib/urql";
import { useCommandPaletteStore } from "../../stores/command-palette";
import { GeneratedProjectTypeSection } from "./GeneratedProjectTypeSection";
import type { GeneratedProjectKind } from "./generated-project-types";

const GENERATED_PROJECTS_QUERY = gql`
  query GeneratedProjects($organizationId: ID!) {
    appSessionGroups(organizationId: $organizationId) {
      id
      name
      slug
      kind
      status
      visibility
      archivedAt
      updatedAt
      connection {
        state
      }
      sessions {
        id
        sessionGroupId
        agentStatus
        sessionStatus
        prUrl
        worktreeDeleted
        lastMessageAt
        lastUserMessageAt
        updatedAt
        createdAt
      }
    }
    designSessionGroups(organizationId: $organizationId) {
      id
      name
      slug
      kind
      status
      visibility
      archivedAt
      updatedAt
      connection {
        state
      }
      sessions {
        id
        sessionGroupId
        agentStatus
        sessionStatus
        prUrl
        worktreeDeleted
        lastMessageAt
        lastUserMessageAt
        updatedAt
        createdAt
      }
    }
    pdfSessionGroups(organizationId: $organizationId) {
      id
      name
      slug
      kind
      status
      visibility
      archivedAt
      updatedAt
      pdfExportStatus
      pdfExportCommitSha
      pdfExportCapturedAt
      pdfExportError
      pdfPageWidth
      pdfPageHeight
      pdfPageUnit
      pdfFormatVersion
      connection {
        state
      }
      sessions {
        id
        sessionGroupId
        agentStatus
        sessionStatus
        prUrl
        worktreeDeleted
        lastMessageAt
        lastUserMessageAt
        updatedAt
        createdAt
      }
    }
  }
`;

type ProjectGroup = SessionGroup & { id: string; sessions?: Array<Session & { id: string }> };

export function GeneratedProjectsSection({
  activeOrgId,
  activeSessionGroupId,
}: {
  activeOrgId: string | null;
  activeSessionGroupId: string | null;
}) {
  const upsertMany = useEntityStore((state) => state.upsertMany);
  const groups = useEntityStore((state) => state.sessionGroups);
  const openGeneratedProjectDialog = useCommandPaletteStore(
    (state) => state.openGeneratedProjectDialog,
  );

  useEffect(() => {
    if (!activeOrgId) return;
    let active = true;
    void client
      .query(
        GENERATED_PROJECTS_QUERY,
        { organizationId: activeOrgId },
        { requestPolicy: "cache-and-network" },
      )
      .toPromise()
      .then((result) => {
        if (!active) return;
        const projectGroups = [
          ...(result.data?.appSessionGroups ?? []),
          ...(result.data?.designSessionGroups ?? []),
          ...(result.data?.pdfSessionGroups ?? []),
        ] as ProjectGroup[];
        if (!projectGroups.length) return;
        upsertMany("sessionGroups", projectGroups as SessionGroupEntity[]);
        const sessions = projectGroups.flatMap((group) => group.sessions ?? []);
        if (sessions.length) upsertMany("sessions", sessions as SessionEntity[]);
      });
    return () => {
      active = false;
    };
  }, [activeOrgId, upsertMany]);

  const projectGroupsByKind = useMemo(() => {
    const byKind: Record<GeneratedProjectKind, SessionGroupEntity[]> = {
      app: [],
      design: [],
      pdf: [],
    };
    for (const group of Object.values(groups)) {
      if (
        !group.archivedAt &&
        (group.kind === "app" || group.kind === "design" || group.kind === "pdf")
      ) {
        byKind[group.kind].push(group);
      }
    }
    for (const projectGroups of Object.values(byKind)) {
      projectGroups.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
    }
    return byKind;
  }, [groups]);

  return (
    <div className="space-y-1 pb-3 pt-2">
      <div className="group/generated-projects-header flex items-center justify-between px-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-foreground">Create</span>
        <button
          type="button"
          title="Create new"
          aria-label="Create new"
          onClick={() => openGeneratedProjectDialog("choose")}
          className="pointer-events-none flex size-5 items-center justify-center rounded opacity-0 transition-opacity hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-ring group-hover/generated-projects-header:pointer-events-auto group-hover/generated-projects-header:opacity-100 group-focus-within/generated-projects-header:pointer-events-auto group-focus-within/generated-projects-header:opacity-100"
        >
          <Plus size={14} />
        </button>
      </div>
      {(Object.keys(projectGroupsByKind) as GeneratedProjectKind[]).map((kind) => (
        <GeneratedProjectTypeSection
          key={kind}
          activeSessionGroupId={activeSessionGroupId}
          groups={projectGroupsByKind[kind]}
          kind={kind}
        />
      ))}
    </div>
  );
}
