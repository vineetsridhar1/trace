import { useEffect, useMemo } from "react";
import { Layers3, Plus } from "lucide-react";
import { gql } from "@urql/core";
import type { DesignSystem, Session, SessionGroup } from "@trace/gql";
import { useEntityStore, type SessionEntity, type SessionGroupEntity } from "@trace/client-core";
import { client } from "../../lib/urql";
import { useCommandPaletteStore } from "../../stores/command-palette";
import { navigateToSessionGroup } from "../../stores/ui";
import { cn } from "../../lib/utils";

const DESIGN_SYSTEMS = gql`
  query SidebarDesignSystems($organizationId: ID!) {
    designSystems(organizationId: $organizationId) {
      id
      organizationId
      name
      description
      status
      archivedAt
      authoringSessionGroupId
      sourceRepoId
      sourceBranch
      sourcePath
      sourceCommitSha
      sourceRepo {
        id
        name
      }
      commitArtifactStatus
      commitArtifactError
      publishStatus
      publishError
      latestPushedCommitSha
      activeVersionId
      activeVersion {
        id
        designSystemId
        version
        sourceCommitSha
        workbenchCommitSha
        createdAt
      }
      latestCommitArtifact {
        id
        designSystemId
        sequence
        commitSha
        status
        packageValid
        packageDigest
        error
        createdAt
        savedAt
      }
      authoringSessionGroup {
        id
        name
        kind
        status
        archivedAt
        updatedAt
        sessions {
          id
          sessionGroupId
          agentStatus
          sessionStatus
          updatedAt
          createdAt
        }
      }
    }
  }
`;
export function DesignSystemsSection({
  activeOrgId,
  activeSessionGroupId,
}: {
  activeOrgId: string | null;
  activeSessionGroupId: string | null;
}) {
  const upsertMany = useEntityStore((state) => state.upsertMany);
  const systems = useEntityStore((state) => state.designSystems);
  const open = useCommandPaletteStore((state) => state.openGeneratedProjectDialog);
  useEffect(() => {
    if (!activeOrgId) return;
    let active = true;
    void client
      .query(DESIGN_SYSTEMS, { organizationId: activeOrgId })
      .toPromise()
      .then((result) => {
        if (!active || result.error) return;
        const rows = (result.data?.designSystems ?? []) as Array<
          DesignSystem & { authoringSessionGroup: SessionGroup & { sessions?: Session[] } }
        >;
        upsertMany("designSystems", rows);
        upsertMany(
          "sessionGroups",
          rows.map((row) => row.authoringSessionGroup) as SessionGroupEntity[],
        );
        upsertMany(
          "sessions",
          rows.flatMap((row) => row.authoringSessionGroup.sessions ?? []) as SessionEntity[],
        );
      });
    return () => {
      active = false;
    };
  }, [activeOrgId, upsertMany]);
  const visible = useMemo(
    () =>
      Object.values(systems)
        .filter((system) => !system.archivedAt)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [systems],
  );
  return (
    <div className="pb-2">
      <div className="group/design-systems flex items-center justify-between px-2">
        <span className="text-xs font-semibold uppercase tracking-wider">Design Systems</span>
        <button
          type="button"
          aria-label="Create design system"
          title="Create design system"
          onClick={() => open("design")}
          className="pointer-events-none flex size-5 items-center justify-center rounded opacity-0 hover:bg-white/10 group-hover/design-systems:pointer-events-auto group-hover/design-systems:opacity-100"
        >
          <Plus size={14} />
        </button>
      </div>
      {visible.length === 0 ? (
        <button
          type="button"
          onClick={() => open("design")}
          className="flex w-full items-center gap-2 rounded-md px-4 py-1.5 text-xs text-muted-foreground hover:bg-white/10"
        >
          <Layers3 size={15} />
          Create a design system
        </button>
      ) : (
        <div className="mt-1">
          {visible.map((system) => (
            <button
              key={system.id}
              type="button"
              onClick={() => navigateToSessionGroup(null, system.authoringSessionGroupId)}
              className={cn(
                "flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-xs hover:bg-white/10",
                activeSessionGroupId === system.authoringSessionGroupId && "bg-white/10",
              )}
            >
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  system.commitArtifactStatus === "failed" || system.publishStatus === "failed"
                    ? "bg-destructive"
                    : system.status === "ready"
                      ? "bg-success"
                      : "bg-muted-foreground",
                )}
              />
              <span className="min-w-0 flex-1 truncate">{system.name}</span>
              {system.activeVersion?.version ? (
                <span className="text-muted-foreground">v{system.activeVersion.version}</span>
              ) : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
