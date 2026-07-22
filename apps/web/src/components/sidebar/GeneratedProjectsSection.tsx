import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Plus } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { gql } from "@urql/core";
import type { Session, SessionGroup } from "@trace/gql";
import {
  useEntityStore,
  type SessionEntity,
  type SessionGroupEntity,
} from "@trace/client-core";
import { client } from "../../lib/urql";
import { useCommandPaletteStore } from "../../stores/command-palette";
import { useUIStore } from "../../stores/ui";
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
      owner {
        id
      }
      designPreviewUrl
      gitCheckpoints {
        id
        committedAt
        previewStatus
        previewUrl
      }
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
      owner {
        id
      }
      designPreviewUrl
      gitCheckpoints {
        id
        committedAt
        previewStatus
        previewUrl
      }
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
      owner {
        id
      }
      designPreviewUrl
      gitCheckpoints {
        id
        committedAt
        previewStatus
        previewUrl
      }
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

export function isCreateListKind(kind: SessionGroup["kind"]): kind is GeneratedProjectKind {
  return kind === "app" || kind === "design" || kind === "design_system" || kind === "pdf";
}

type SidebarProjectKind = Exclude<GeneratedProjectKind, "design_system">;

export function isSidebarCreateListKind(
  kind: SessionGroup["kind"],
): kind is SidebarProjectKind {
  return kind === "app" || kind === "design" || kind === "pdf";
}

export function GeneratedProjectsSection({
  activeOrgId,
  activeSessionGroupId,
}: {
  activeOrgId: string | null;
  activeSessionGroupId: string | null;
}) {
  const upsertMany = useEntityStore((state) => state.upsertMany);
  const groups = useEntityStore((state) => state.sessionGroups);
  const [expanded, setExpanded] = useState(true);
  const openGeneratedProjectDialog = useCommandPaletteStore(
    (state) => state.openGeneratedProjectDialog,
  );
  const setActivePage = useUIStore((state) => state.setActivePage);

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
    const byKind: Record<SidebarProjectKind, SessionGroupEntity[]> = {
      app: [],
      design: [],
      pdf: [],
    };
    for (const group of Object.values(groups)) {
      if (!group.archivedAt && isSidebarCreateListKind(group.kind)) {
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
      <div className="group/generated-projects-header flex items-center justify-between rounded-md pr-1 transition-colors hover:bg-white/10">
        <button
          type="button"
          aria-controls="generated-projects-list"
          aria-expanded={expanded}
          aria-label={`${expanded ? "Collapse" : "Expand"} Create`}
          onClick={() => setExpanded((current) => !current)}
          className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-foreground transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRight
            size={14}
            className={expanded ? "shrink-0 rotate-90 transition-transform" : "shrink-0 transition-transform"}
          />
        </button>
        <button
          type="button"
          onClick={() => setActivePage("create")}
          className="flex flex-1 cursor-pointer items-center rounded-md py-1 text-left text-xs font-semibold uppercase tracking-wider text-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span>Create</span>
        </button>
        <button
          type="button"
          title="Create new"
          aria-label="Create new"
          onClick={() => openGeneratedProjectDialog("choose")}
          className="pointer-events-none flex size-5 items-center justify-center rounded text-foreground opacity-0 transition-opacity hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-ring group-hover/generated-projects-header:pointer-events-auto group-hover/generated-projects-header:opacity-100 group-focus-within/generated-projects-header:pointer-events-auto group-focus-within/generated-projects-header:opacity-100"
        >
          <Plus size={14} />
        </button>
      </div>
      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            id="generated-projects-list"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.16, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden pl-3"
          >
            {(Object.keys(projectGroupsByKind) as SidebarProjectKind[]).map((kind) => (
              <GeneratedProjectTypeSection
                key={kind}
                activeSessionGroupId={activeSessionGroupId}
                groups={projectGroupsByKind[kind]}
                kind={kind}
              />
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
