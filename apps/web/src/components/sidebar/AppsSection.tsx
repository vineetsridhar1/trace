import { useEffect, useMemo, useState } from "react";
import { AppWindow, Plus, Trash2 } from "lucide-react";
import { gql } from "@urql/core";
import type { Session, SessionGroup } from "@trace/gql";
import { useEntityStore, type SessionEntity, type SessionGroupEntity } from "@trace/client-core";
import { client } from "../../lib/urql";
import { cn } from "../../lib/utils";
import { navigateToSessionGroup } from "../../stores/ui";
import { useCommandPaletteStore } from "../../stores/command-palette";
import { SessionStatusIndicator } from "../channel/SessionStatusIndicator";
import { DeleteAppDialog } from "./DeleteAppDialog";
import { useAppSessionGroupRow } from "./useAppSessionGroupRow";

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
        const groups = result.data?.appSessionGroups as Array<
          SessionGroup & { id: string; sessions?: Array<Session & { id: string }> }
        >;
        if (!groups?.length) return;
        upsertMany("sessionGroups", groups as SessionGroupEntity[]);
        // Upsert member sessions so the sidebar's AI status indicator reflects
        // live agent status (the store links them to the group by sessionGroupId).
        const sessions = groups.flatMap((group) => group.sessions ?? []);
        if (sessions.length) upsertMany("sessions", sessions as SessionEntity[]);
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
        <div className="mt-1 space-y-0.5">
          {appGroups.map((group) => (
            <AppSessionItem
              key={group.id}
              group={group}
              isActive={group.id === activeSessionGroupId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AppSessionItem({ group, isActive }: { group: SessionGroupEntity; isActive: boolean }) {
  const row = useAppSessionGroupRow(group);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const name = group.name ?? "Untitled app";

  return (
    <>
      <div
        className={cn(
          "group/app-item relative flex h-7 min-w-0 items-center rounded-md transition-colors",
          isActive ? "bg-white/10 text-foreground" : "text-foreground hover:bg-white/10",
        )}
      >
        <button
          type="button"
          onClick={() => navigateToSessionGroup(null, group.id)}
          title={name}
          className="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-1.5 pr-7 text-left text-xs leading-none"
        >
          <SessionStatusIndicator row={row} size={6} showDonePulse={false} />
          <span className="min-w-0 flex-1 truncate">{name}</span>
        </button>
        <button
          type="button"
          title={`Delete ${name}`}
          aria-label={`Delete ${name}`}
          onClick={() => setDeleteOpen(true)}
          className="pointer-events-none absolute right-1 flex size-5 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-white/10 hover:text-destructive group-hover/app-item:pointer-events-auto group-hover/app-item:opacity-100 group-focus-within/app-item:pointer-events-auto group-focus-within/app-item:opacity-100"
        >
          <Trash2 size={13} />
        </button>
      </div>
      <DeleteAppDialog
        appId={group.id}
        appName={name}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </>
  );
}
