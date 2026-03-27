import { useState, useEffect, useCallback, useRef } from "react";
import { ArrowLeft } from "lucide-react";
import { gql } from "@urql/core";
import type {
  DefaultMenuItem,
  GetContextMenuItemsParams,
  GridApi,
  MenuItemDef,
} from "ag-grid-community";
import type { SessionGroup } from "@trace/gql";
import { client } from "../../lib/urql";
import { useEntityStore } from "../../stores/entity";
import type { SessionEntity, SessionGroupEntity } from "../../stores/entity";
import { navigateToSessionGroup } from "../../stores/ui";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { DeleteSessionGroupDialog } from "../session/DeleteSessionGroupDialog";
import { createTable } from "../ui/table";
import { sessionColumns, applySessionsColumnMode } from "./sessions-table-columns";
import type { SessionGroupRow } from "./sessions-table-types";
import {
  getSessionGroupDisplayStatus,
  getSessionGroupAgentStatus,
} from "../session/sessionStatus";
import { cn } from "../../lib/utils";

const MERGED_GROUPS_QUERY = gql`
  query MergedSessionGroups($channelId: ID!, $status: SessionGroupStatus) {
    sessionGroups(channelId: $channelId, status: $status) {
      id
      name
      status
      prUrl
      worktreeDeleted
      archivedAt
      channel { id }
      createdAt
      updatedAt
      sessions {
        id
        name
        agentStatus
        sessionStatus
        tool
        model
        hosting
        branch
        prUrl
        worktreeDeleted
        sessionGroupId
        connection { state runtimeInstanceId runtimeLabel lastError retryCount canRetry canMove }
        createdBy { id name avatarUrl }
        repo { id name }
        channel { id }
        createdAt
        updatedAt
      }
    }
  }
`;

const ARCHIVED_GROUPS_QUERY = gql`
  query ArchivedSessionGroups($channelId: ID!, $archived: Boolean) {
    sessionGroups(channelId: $channelId, archived: $archived) {
      id
      name
      status
      prUrl
      worktreeDeleted
      archivedAt
      channel { id }
      createdAt
      updatedAt
      sessions {
        id
        name
        agentStatus
        sessionStatus
        tool
        model
        hosting
        branch
        prUrl
        worktreeDeleted
        sessionGroupId
        connection { state runtimeInstanceId runtimeLabel lastError retryCount canRetry canMove }
        createdBy { id name avatarUrl }
        repo { id name }
        channel { id }
        createdAt
        updatedAt
      }
    }
  }
`;

const mergedTableInstance = createTable<SessionGroupRow>({
  id: "merged-sessions",
  columns: sessionColumns,
});
const MergedGridTable = mergedTableInstance.Table;
const useMergedTable = mergedTableInstance.useTable;

const archivedTableInstance = createTable<SessionGroupRow>({
  id: "archived-sessions",
  columns: sessionColumns,
});
const ArchivedGridTable = archivedTableInstance.Table;
const useArchivedTable = archivedTableInstance.useTable;

type Tab = "merged" | "archived";

function groupsToRows(groups: Array<SessionGroup & { id: string }>): SessionGroupRow[] {
  return groups.map((group) => {
    const sessions = (group.sessions ?? []) as SessionEntity[];
    const sorted = [...sessions].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
    const latestSession = sorted[0];
    const createdBySession = [...sessions].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    )[0];
    const agentStatuses = sessions.map((s) => s.agentStatus);
    const sessionStatuses = sessions.map((s) => s.sessionStatus);
    const prUrl = group.prUrl as string | null | undefined;
    const displaySessionStatus =
      (group.status as string) ??
      getSessionGroupDisplayStatus(sessionStatuses, agentStatuses, prUrl);
    const displayAgentStatus = getSessionGroupAgentStatus(agentStatuses);

    return {
      ...group,
      latestSession,
      createdBySession,
      displaySessionStatus,
      displayAgentStatus,
      _sessionCount: sessions.length,
      _lastMessageAt: latestSession?.updatedAt ?? group.updatedAt,
      _sortTimestamp: latestSession?.updatedAt ?? group.updatedAt,
    } as SessionGroupRow;
  });
}

function TabTable({
  channelId,
  tab,
  active,
}: {
  channelId: string;
  tab: Tab;
  active: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [fetched, setFetched] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
    sessionCount: number;
  } | null>(null);
  const gridApiRef = useRef<GridApi<SessionGroupRow> | null>(null);
  const upsertMany = useEntityStore((s) => s.upsertMany);
  const setRows = tab === "merged" ? useMergedTable((s) => s.setRows) : useArchivedTable((s) => s.setRows);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const query = tab === "merged" ? MERGED_GROUPS_QUERY : ARCHIVED_GROUPS_QUERY;
    const variables =
      tab === "merged"
        ? { channelId, status: "merged" }
        : { channelId, archived: true };

    const result = await client.query(query, variables).toPromise();
    if (result.data?.sessionGroups) {
      const groups = result.data.sessionGroups as Array<SessionGroup & { id: string }>;
      const flattenedSessions = groups.flatMap((g) => g.sessions ?? []);
      upsertMany(
        "sessionGroups",
        groups.map((g) => ({
          ...g,
          _sortTimestamp: g.sessions?.[0]?.updatedAt ?? g.updatedAt,
        })) as Array<SessionGroupEntity & { id: string }>,
      );
      upsertMany("sessions", flattenedSessions as Array<SessionEntity & { id: string }>);

      const rows = groupsToRows(groups);
      setRows(rows);
    }
    setLoading(false);
    setFetched(true);
  }, [channelId, tab, upsertMany, setRows]);

  useEffect(() => {
    if (active && !fetched) {
      fetchData();
    }
  }, [active, fetched, fetchData]);

  const getContextMenuItems = useCallback(
    (params: GetContextMenuItemsParams<SessionGroupRow>): (DefaultMenuItem | MenuItemDef<SessionGroupRow>)[] => {
      if (!params.node?.data) return [];
      const group = params.node.data;
      return [
        {
          name: "Delete Workspace",
          cssClasses: ["text-destructive"],
          action: () => {
            setDeleteTarget({
              id: group.id,
              name: group.name,
              sessionCount: group._sessionCount,
            });
          },
        },
      ];
    },
    [],
  );

  if (!active) return null;

  if (loading) {
    return (
      <div className="space-y-1 px-4 pt-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex h-10 items-center gap-4 px-2">
            <Skeleton className="h-2 w-2 shrink-0 rounded-full" />
            <Skeleton className="h-3.5 w-[40%]" />
            <Skeleton className="ml-auto h-3.5 w-[10%]" />
          </div>
        ))}
      </div>
    );
  }

  const GridTable = tab === "merged" ? MergedGridTable : ArchivedGridTable;

  return (
    <>
      <GridTable
        className="h-full"
        agGridOptions={{
          onRowClicked: (event: {
            node: { group?: boolean; expanded?: boolean; setExpanded: (v: boolean) => void };
            data?: SessionGroupRow;
          }) => {
            if (event.node.group) {
              event.node.setExpanded(!event.node.expanded);
              return;
            }
            const latestSessionId = event.data?.latestSession?.id ?? null;
            if (event.data?.id) {
              navigateToSessionGroup(channelId, event.data.id, latestSessionId);
            }
          },
          onGridReady: (event) => {
            gridApiRef.current = event.api;
            applySessionsColumnMode(event.api, false);
          },
          rowHeight: 40,
          headerHeight: 32,
          suppressCellFocus: true,
          getContextMenuItems,
        }}
      />
      {deleteTarget && (
        <DeleteSessionGroupDialog
          groupId={deleteTarget.id}
          groupName={deleteTarget.name}
          sessionCount={deleteTarget.sessionCount}
          open={true}
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null);
          }}
        />
      )}
    </>
  );
}

export function MergedArchivedPage({
  channelId,
  onBack,
}: {
  channelId: string;
  onBack: () => void;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("merged");

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onBack}
        >
          <ArrowLeft size={15} />
        </Button>
        <h2 className="text-sm font-semibold text-foreground">
          Merged & Archived
        </h2>
      </div>
      <div className="flex gap-1 border-b border-border px-4">
        <button
          className={cn(
            "px-3 py-1.5 text-xs font-medium transition-colors",
            activeTab === "merged"
              ? "border-b-2 border-foreground text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => setActiveTab("merged")}
        >
          Merged
        </button>
        <button
          className={cn(
            "px-3 py-1.5 text-xs font-medium transition-colors",
            activeTab === "archived"
              ? "border-b-2 border-foreground text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => setActiveTab("archived")}
        >
          Archived
        </button>
      </div>
      <div className="flex-1 overflow-hidden">
        <TabTable channelId={channelId} tab="merged" active={activeTab === "merged"} />
        <TabTable channelId={channelId} tab="archived" active={activeTab === "archived"} />
      </div>
    </div>
  );
}
