import { useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { gql } from "@urql/core";
import type { Session, SessionGroup } from "@trace/gql";
import {
  useEntityStore,
  type SessionEntity,
  type SessionGroupEntity,
} from "@trace/client-core";
import { client } from "../../lib/urql";
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
  const [expanded, setExpanded] = useState(true);

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
      <div className="group/generated-projects-header flex items-center justify-between rounded-md pr-1 transition-colors hover:bg-white/10">
        <button
          type="button"
          aria-controls="generated-projects-list"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className="flex flex-1 cursor-pointer items-center gap-1 rounded-md px-0 py-1 pl-2 text-left text-xs font-semibold uppercase tracking-wider text-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRight
            size={14}
            className={expanded ? "shrink-0 rotate-90 transition-transform" : "shrink-0 transition-transform"}
          />
          <span>Create</span>
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
            className="overflow-hidden"
          >
            {(Object.keys(projectGroupsByKind) as GeneratedProjectKind[]).map((kind) => (
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
