import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { gql } from "@urql/core";
import type { DesignSystem, Session, SessionGroup } from "@trace/gql";
import {
  mergeSessionGroupEntity,
  useEntityStore,
  type SessionEntity,
  type SessionGroupEntity,
} from "@trace/client-core";
import { client } from "../../lib/urql";
import { useHomeDataStore } from "../../stores/home-data";
import { useUIStore } from "../../stores/ui";
import { cn } from "../../lib/utils";
import { GeneratedProjectTypeSection } from "./GeneratedProjectTypeSection";

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
        name
        avatarUrl
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
        createdById
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
        name
        avatarUrl
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
        createdById
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
        name
        avatarUrl
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
        createdById
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
    animationSessionGroups(organizationId: $organizationId) {
      id
      name
      slug
      kind
      status
      visibility
      owner {
        id
        name
        avatarUrl
      }
      animationPreviewUrl
      animationPreviewStatus
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
        createdById
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
    designSystems(organizationId: $organizationId) {
      id
      authoringSessionGroupId
      archivedAt
      name
      status
      authoringSessionGroup {
        id
        name
        slug
        kind
        status
        visibility
        owner {
          id
          name
          avatarUrl
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
          createdById
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
  }
`;

type ProjectGroup = SessionGroup & { id: string; sessions?: Array<Session & { id: string }> };
type LoadedDesignSystem = DesignSystem & { authoringSessionGroup: ProjectGroup };

const PROJECT_KINDS = ["app", "design", "design_system", "pdf", "animation"] as const;

export function GeneratedProjectsSection({ activeOrgId }: { activeOrgId: string | null }) {
  const upsertMany = useEntityStore((state) => state.upsertMany);
  const sessionGroups = useEntityStore((state) => state.sessionGroups);
  const activeSessionGroupId = useUIStore((state) => state.activeSessionGroupId);
  const homeRetryRequest = useHomeDataStore((state) => state.retryRequest);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (!activeOrgId) return;
    useHomeDataStore.getState().ensureOrganization(activeOrgId);
    useHomeDataStore.getState().markGeneratedStatus(activeOrgId, "loading");
    let active = true;
    void (async () => {
      try {
        const result = await client
          .query(
            GENERATED_PROJECTS_QUERY,
            { organizationId: activeOrgId },
            { requestPolicy: "cache-and-network" },
          )
          .toPromise();
        if (!active) return;
        const projectGroups = [
          ...(result.data?.appSessionGroups ?? []),
          ...(result.data?.designSessionGroups ?? []),
          ...(result.data?.pdfSessionGroups ?? []),
          ...(result.data?.animationSessionGroups ?? []),
          ...(result.data?.designSystems ?? []).map(
            (system: LoadedDesignSystem) => system.authoringSessionGroup,
          ),
        ] as ProjectGroup[];
        const designSystems = (result.data?.designSystems ?? []) as DesignSystem[];
        if (designSystems.length) upsertMany("designSystems", designSystems);
        if (projectGroups.length) {
          const existingGroups = useEntityStore.getState().sessionGroups;
          upsertMany(
            "sessionGroups",
            projectGroups.map((group) =>
              mergeSessionGroupEntity(existingGroups[group.id], group as SessionGroupEntity),
            ),
          );
          const sessions = projectGroups.flatMap((group) => group.sessions ?? []);
          if (sessions.length) upsertMany("sessions", sessions as SessionEntity[]);
        }
        useHomeDataStore
          .getState()
          .markGeneratedStatus(activeOrgId, result.error ? "error" : "ready");
      } catch {
        if (active) useHomeDataStore.getState().markGeneratedStatus(activeOrgId, "error");
      }
    })();
    return () => {
      active = false;
    };
  }, [activeOrgId, homeRetryRequest, upsertMany]);

  const groupsByKind = useMemo(
    () =>
      PROJECT_KINDS.reduce<Record<(typeof PROJECT_KINDS)[number], SessionGroupEntity[]>>(
        (groups, kind) => {
          groups[kind] = Object.values(sessionGroups)
            .filter((group) => group.kind === kind && !group.archivedAt)
            .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
          return groups;
        },
        { app: [], design: [], design_system: [], pdf: [], animation: [] },
      ),
    [sessionGroups],
  );

  return (
    <section className="pt-2">
      <button
        type="button"
        aria-controls="sidebar-creations-list"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 pl-4 text-left text-sm font-medium text-foreground transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Sparkles size={16} className="shrink-0" />
        <span className="flex-1">Creations</span>
        <ChevronRight
          size={14}
          className={cn("shrink-0 transition-transform duration-200", open && "rotate-90")}
        />
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            id="sidebar-creations-list"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.16, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="pt-1">
              {PROJECT_KINDS.map((kind) => (
                <GeneratedProjectTypeSection
                  key={kind}
                  activeSessionGroupId={activeSessionGroupId}
                  groups={groupsByKind[kind]}
                  kind={kind}
                />
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
