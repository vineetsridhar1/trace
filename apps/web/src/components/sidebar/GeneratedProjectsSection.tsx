import { useEffect } from "react";
import { Sparkles } from "lucide-react";
import { gql } from "@urql/core";
import type { DesignSystem, Session, SessionGroup } from "@trace/gql";
import {
  mergeSessionGroupEntity,
  useEntityStore,
  type SessionEntity,
  type SessionGroupEntity,
} from "@trace/client-core";
import { client } from "../../lib/urql";
import { cn } from "../../lib/utils";
import { useHomeComposerStore } from "../../stores/home-composer";
import { useUIStore } from "../../stores/ui";
import { useHomeDataStore } from "../../stores/home-data";
import { useSidebar } from "../ui/sidebar";

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
        createdBy {
          id
          name
          avatarUrl
        }
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
        createdBy {
          id
          name
          avatarUrl
        }
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
        createdBy {
          id
          name
          avatarUrl
        }
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
        createdBy {
          id
          name
          avatarUrl
        }
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
          createdBy {
            id
            name
            avatarUrl
          }
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

export function GeneratedProjectsSection({ activeOrgId }: { activeOrgId: string | null }) {
  const upsertMany = useEntityStore((state) => state.upsertMany);
  const activePage = useUIStore((state) => state.activePage);
  const setActivePage = useUIStore((state) => state.setActivePage);
  const homeRetryRequest = useHomeDataStore((state) => state.retryRequest);
  const requestComposerFocus = useHomeComposerStore((state) => state.requestFocus);
  const { isMobile, setOpenMobile } = useSidebar();

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

  const openCreate = () => {
    setActivePage("create");
    requestComposerFocus();
    if (isMobile) setOpenMobile(false);
  };

  return (
    <button
      type="button"
      onClick={openCreate}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium transition-colors",
        "pl-4",
        activePage === "create"
          ? "bg-white/10 text-foreground"
          : "text-foreground hover:bg-white/10",
      )}
    >
      <Sparkles size={16} className="shrink-0" />
      <span>Creations</span>
    </button>
  );
}
