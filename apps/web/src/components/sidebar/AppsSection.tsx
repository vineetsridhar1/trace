import { useEffect, useMemo } from "react";
import { AppWindow, Plus } from "lucide-react";
import { gql } from "@urql/core";
import type { SessionGroup } from "@trace/gql";
import { useEntityStore, type SessionGroupEntity } from "@trace/client-core";
import { client } from "../../lib/urql";
import { cn } from "../../lib/utils";
import { navigateToSessionGroup } from "../../stores/ui";
import { useCommandPaletteStore } from "../../stores/command-palette";
import { sidebarRootLeftEdgeRowClass } from "./sidebarItemStyles";

const APP_SESSION_GROUPS_QUERY = gql`
  query AppSessionGroups($organizationId: ID!) {
    appSessionGroups(organizationId: $organizationId) {
      id
      name
      slug
      kind
      status
      visibility
      connection {
        state
      }
    }
  }
`;

export function AppsSection({
  activeOrgId,
  activeSessionGroupId,
}: {
  activeOrgId: string | null;
  activeSessionGroupId: string | null;
}) {
  const upsertMany = useEntityStore((s) => s.upsertMany);
  const setNewAppSessionOpen = useCommandPaletteStore((s) => s.setNewAppSessionOpen);

  useEffect(() => {
    if (!activeOrgId) return;
    let active = true;
    void client
      .query(
        APP_SESSION_GROUPS_QUERY,
        { organizationId: activeOrgId },
        { requestPolicy: "cache-and-network" },
      )
      .toPromise()
      .then((result) => {
        if (!active) return;
        const groups = result.data?.appSessionGroups as Array<SessionGroup & { id: string }>;
        if (groups?.length) upsertMany("sessionGroups", groups as SessionGroupEntity[]);
      });
    return () => {
      active = false;
    };
  }, [activeOrgId, upsertMany]);

  // Subscribe to the raw table (stable reference) and derive the app-group list
  // in useMemo — a selector returning a freshly mapped array loops the store.
  const sessionGroupsTable = useEntityStore(
    (s: { sessionGroups: Record<string, SessionGroupEntity> }) => s.sessionGroups,
  );
  const appGroups = useMemo(
    () =>
      Object.values(sessionGroupsTable)
        .filter((group) => group.kind === "app" && !group.archivedAt)
        .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")),
    [sessionGroupsTable],
  );

  return (
    <div className="pt-2">
      <div className="group/apps-header flex items-center justify-between px-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-foreground">Apps</span>
        <button
          type="button"
          title="New app session"
          aria-label="New app session"
          onClick={() => setNewAppSessionOpen(true)}
          className="pointer-events-none flex size-5 items-center justify-center rounded opacity-0 transition-opacity hover:bg-white/10 group-hover/apps-header:pointer-events-auto group-hover/apps-header:opacity-100 group-focus-within/apps-header:pointer-events-auto group-focus-within/apps-header:opacity-100"
        >
          <Plus size={14} />
        </button>
      </div>

      {appGroups.length === 0 ? (
        <button
          type="button"
          onClick={() => setNewAppSessionOpen(true)}
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 pl-4 text-sm text-muted-foreground transition-colors hover:bg-white/10",
          )}
        >
          <AppWindow size={16} />
          <span>Build an app</span>
        </button>
      ) : (
        appGroups.map((group) => {
          const isActive = group.id === activeSessionGroupId;
          return (
            <button
              key={group.id}
              type="button"
              onClick={() => navigateToSessionGroup(null, group.id)}
              title={group.name ?? "App"}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 pl-4 text-sm transition-colors",
                sidebarRootLeftEdgeRowClass,
                isActive ? "bg-white/10 text-foreground" : "text-foreground hover:bg-white/10",
              )}
            >
              <AppWindow size={16} className="shrink-0 text-muted-foreground" />
              <span className="truncate">{group.name ?? "Untitled app"}</span>
            </button>
          );
        })
      )}
    </div>
  );
}
