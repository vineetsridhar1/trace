import { useEffect } from "react";
import { Plus, Sparkles } from "lucide-react";
import { gql } from "@urql/core";
import type { Session, SessionGroup } from "@trace/gql";
import {
  mergeSessionGroupEntity,
  useEntityStore,
  type SessionEntity,
  type SessionGroupEntity,
} from "@trace/client-core";
import { client } from "../../lib/urql";
import { cn } from "../../lib/utils";
import { useCommandPaletteStore } from "../../stores/command-palette";
import { useUIStore } from "../../stores/ui";
import { useHomeDataStore } from "../../stores/home-data";
import { sidebarRootLeftEdgeRowClass } from "./sidebarItemStyles";

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
    animationSessionGroups(organizationId: $organizationId) {
      id
      name
      slug
      kind
      status
      visibility
      owner {
        id
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

export function GeneratedProjectsSection({ activeOrgId }: { activeOrgId: string | null }) {
  const upsertMany = useEntityStore((state) => state.upsertMany);
  const activePage = useUIStore((state) => state.activePage);
  const openGeneratedProjectDialog = useCommandPaletteStore(
    (state) => state.openGeneratedProjectDialog,
  );
  const setActivePage = useUIStore((state) => state.setActivePage);

  useEffect(() => {
    if (!activeOrgId) return;
    useHomeDataStore.getState().ensureOrganization(activeOrgId);
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
          ...(result.data?.animationSessionGroups ?? []),
        ] as ProjectGroup[];
        if (!projectGroups.length) return;
        const existingGroups = useEntityStore.getState().sessionGroups;
        upsertMany(
          "sessionGroups",
          projectGroups.map((group) =>
            mergeSessionGroupEntity(existingGroups[group.id], group as SessionGroupEntity),
          ),
        );
        const sessions = projectGroups.flatMap((group) => group.sessions ?? []);
        if (sessions.length) upsertMany("sessions", sessions as SessionEntity[]);
      })
      .finally(() => {
        useHomeDataStore.getState().markGeneratedLoaded(activeOrgId);
      });
    return () => {
      active = false;
    };
  }, [activeOrgId, upsertMany]);

  return (
    <div className="group/create relative">
      <button
        type="button"
        onClick={() => setActivePage("create")}
        className={cn(
          "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 pr-10 text-left transition-colors",
          sidebarRootLeftEdgeRowClass,
          "pl-4",
          activePage === "create"
            ? "bg-white/10 text-foreground"
            : "text-foreground hover:bg-white/10",
        )}
      >
        <Sparkles size={16} className="shrink-0" />
        <span className="min-w-0">
          <span className="block text-sm font-medium">Create</span>
          <span className="block truncate text-[10px] font-normal text-muted-foreground">
            Apps, designs, documents & animations
          </span>
        </span>
      </button>
      <button
        type="button"
        title="Create new"
        aria-label="Create new"
        onClick={() => openGeneratedProjectDialog("choose")}
        className="absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground opacity-60 transition-colors hover:bg-white/10 hover:text-foreground hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover/create:opacity-100"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
