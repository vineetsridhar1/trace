import { useState, useEffect, useCallback } from "react";
import { ArrowLeft } from "lucide-react";
import { gql } from "@urql/core";
import type { DefaultMenuItem, GetContextMenuItemsParams, MenuItemDef } from "ag-grid-community";
import type { SessionGroup } from "@trace/gql";
import { client } from "../../lib/urql";
import { useEntityStore, type EntityState } from "@trace/client-core";
import type { SessionEntity, SessionGroupEntity } from "@trace/client-core";
import { useUIStore, type UIState } from "../../stores/ui";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { DeleteSessionGroupDialog } from "../session/DeleteSessionGroupDialog";
import { createTable, type TableState } from "../ui/table";
import { sessionColumns, applySessionsColumnMode } from "./sessions-table-columns";
import type { SessionGridRow } from "./sessions-table-types";
import { FILTER_STORAGE_KEY_PREFIX } from "./sessions-table-types";
import { useSessionGroupRows } from "./useSessionGroupRows";
import { useSessionsGridOptions } from "./useSessionsGridOptions";
import { useSessionStatusGrouping } from "./useSessionStatusGrouping";
import { cn } from "../../lib/utils";

const FILTERED_SESSION_GROUPS_QUERY = gql`
  query FilteredSessionGroups($channelId: ID!, $archived: Boolean, $status: SessionGroupStatus) {
    sessionGroups(channelId: $channelId, archived: $archived, status: $status) {
      id
      name
      status
      prUrl
      worktreeDeleted
      archivedAt
      setupStatus
      setupError
      channel {
        id
      }
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
        lastMessageAt
        connection {
          state
          runtimeInstanceId
          runtimeLabel
          lastError
          retryCount
          canRetry
          canMove
          autoRetryable
        }
        createdBy {
          id
          name
          avatarUrl
        }
        repo {
          id
          name
        }
        channel {
          id
        }
        createdAt
        updatedAt
      }
    }
  }
`;

const mergedTableInstance = createTable<SessionGridRow>({
  id: "merged-sessions",
  columns: sessionColumns,
});
const MergedGridTable = mergedTableInstance.Table;
const useMergedTable = mergedTableInstance.useTable;

const archivedTableInstance = createTable<SessionGridRow>({
  id: "archived-sessions",
  columns: sessionColumns,
});
const ArchivedGridTable = archivedTableInstance.Table;
const useArchivedTable = archivedTableInstance.useTable;

type Tab = "merged" | "archived";

function TabTable({ channelId, tab, active }: { channelId: string; tab: Tab; active: boolean }) {
  const upsertMany = useEntityStore((s: EntityState) => s.upsertMany);
  const activeSessionGroupId = useUIStore((s: UIState) => s.activeSessionGroupId);
  const rows = useSessionGroupRows(
    channelId,
    tab === "merged" ? { status: "merged" } : { archived: true },
  );
  const { gridRows, onFilterModelChanged, onToggleStatusGroup } = useSessionStatusGrouping(rows);
  const [loading, setLoading] = useState(true);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
    sessionCount: number;
  } | null>(null);
  const setMergedRows = useMergedTable((s: TableState<SessionGridRow>) => s.setRows);
  const setArchivedRows = useArchivedTable((s: TableState<SessionGridRow>) => s.setRows);
  const setRows = tab === "merged" ? setMergedRows : setArchivedRows;
  const GridTable = tab === "merged" ? MergedGridTable : ArchivedGridTable;
  const queryKey = `${channelId}:${tab}`;

  useEffect(() => {
    setRows(gridRows);
  }, [gridRows, setRows]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const variables =
      tab === "merged" ? { channelId, status: "merged" } : { channelId, archived: true };

    const result = await client.query(FILTERED_SESSION_GROUPS_QUERY, variables).toPromise();
    if (result.data?.sessionGroups) {
      const groups = result.data.sessionGroups as Array<SessionGroup & { id: string }>;
      const flattenedSessions = groups.flatMap((group) => group.sessions ?? []);

      upsertMany(
        "sessionGroups",
        groups.map((group) => ({
          ...group,
          _sortTimestamp:
            group.sessions?.[0]?.lastMessageAt ?? group.sessions?.[0]?.updatedAt ?? group.updatedAt,
        })) as Array<SessionGroupEntity & { id: string }>,
      );
      upsertMany("sessions", flattenedSessions as Array<SessionEntity & { id: string }>);
    }
    setLoading(false);
    setLoadedKey(queryKey);
  }, [channelId, queryKey, tab, upsertMany]);

  useEffect(() => {
    if (active && loadedKey !== queryKey) {
      fetchData();
    }
  }, [active, fetchData, loadedKey, queryKey]);

  const getContextMenuItems = useCallback(
    (
      params: GetContextMenuItemsParams<SessionGridRow>,
    ): (DefaultMenuItem | MenuItemDef<SessionGridRow>)[] => {
      if (!params.node?.data || "_isStatusHeader" in params.node.data) return [];
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

  const filterStorageKey = `${FILTER_STORAGE_KEY_PREFIX}${channelId}:${tab}`;
  const agGridOptions = useSessionsGridOptions({
    channelId,
    filterStorageKey,
    getContextMenuItems,
    isCompact: false,
    onFilterModelChanged,
    onGridReady: (event) => {
      applySessionsColumnMode(event.api, false);
    },
    onToggleStatusGroup,
  });
  const selectedRowIds = activeSessionGroupId ? [activeSessionGroupId] : undefined;

  if (!active) return null;

  if (loading && rows.length === 0) {
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

  return (
    <>
      <GridTable className="h-full" agGridOptions={agGridOptions} selectedRowIds={selectedRowIds} />
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
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onBack}>
          <ArrowLeft size={15} />
        </Button>
        <h2 className="text-sm font-semibold text-foreground">Merged & Archived</h2>
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
