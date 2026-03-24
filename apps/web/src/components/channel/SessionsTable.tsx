import { useCallback, useEffect, useMemo, useState } from "react";
import { Circle, Loader2 } from "lucide-react";
import type {
  ColDef,
  FilterChangedEvent,
  GetContextMenuItemsParams,
  GridReadyEvent,
  ICellRendererParams,
  IsGroupOpenByDefaultParams,
  MenuItemDef,
} from "ag-grid-community";
import { createTable } from "../ui/table";
import { useEntityStore } from "../../stores/entity";
import type { SessionEntity, SessionGroupEntity } from "../../stores/entity";
import { navigateToSessionGroup } from "../../stores/ui";
import { getSessionGroupChannelId } from "../../lib/session-group";
import {
  getSessionGroupDisplayStatus,
  isGroupReviewAndActive,
  statusColor,
  statusLabel,
} from "../session/sessionStatus";
import { timeAgo } from "../../lib/utils";
import { UserProfileChatCard } from "../shared/UserProfileChatCard";
import { DeleteSessionGroupDialog } from "../session/DeleteSessionGroupDialog";

type SessionGroupRow = SessionGroupEntity & {
  id: string;
  status: string;
  reviewAndActive?: boolean;
  latestSession?: SessionEntity;
  createdBySession?: SessionEntity;
  _lastMessageAt?: string;
  _sortTimestamp?: string;
  _sessionCount: number;
};

const BUCKET_MS = 2 * 60 * 1000;
function bucketize(ts: string | undefined): number {
  if (!ts) return 0;
  const t = new Date(ts).getTime();
  return Math.floor(t / BUCKET_MS) * BUCKET_MS;
}

const collapsedByDefault = new Set(["merged", "failed"]);
const FILTER_STORAGE_KEY_PREFIX = "trace:sessions-filter:";

const statusGroupOrder: Record<string, number> = {
  needs_input: 0,
  creating: 1,
  active: 2,
  completed: 3,
  paused: 4,
  pending: 5,
  in_review: 6,
  merged: 7,
  failed: 8,
  unreachable: 9,
};

const columns: ColDef<SessionGroupRow>[] = [
  {
    headerName: "Name",
    field: "name",
    flex: 2,
    minWidth: 200,
    filter: true,
    cellRenderer: (params: ICellRendererParams<SessionGroupRow>) => {
      const { data } = params;
      if (!data) return null;
      const color = statusColor[data.status ?? "active"];
      return (
        <div className="flex h-full items-center gap-2">
          {data.reviewAndActive ? (
            <Loader2 size={12} className={`shrink-0 animate-spin ${color}`} />
          ) : (
            <Circle size={8} className={`shrink-0 fill-current ${color}`} />
          )}
          <span className="truncate text-sm text-foreground">{data.name}</span>
        </div>
      );
    },
  },
  {
    headerName: "Status",
    field: "status",
    rowGroup: true,
    hide: true,
  },
  {
    headerName: "Repo",
    field: "repo" as keyof SessionGroupRow,
    width: 140,
    filter: true,
    valueGetter: (params) => {
      const repo =
        (params.data?.repo as { id: string; name: string } | null | undefined)
        ?? (params.data?.latestSession?.repo as { id: string; name: string } | null | undefined);
      return repo?.name ?? "";
    },
    cellRenderer: (params: ICellRendererParams<SessionGroupRow>) => {
      const repo =
        (params.data?.repo as { id: string; name: string } | null | undefined)
        ?? (params.data?.latestSession?.repo as { id: string; name: string } | null | undefined);
      if (!repo) return null;
      return <span className="truncate text-xs text-muted-foreground">{repo.name}</span>;
    },
  },
  {
    headerName: "Created by",
    colId: "createdBy",
    width: 150,
    filter: true,
    filterValueGetter: (params) => {
      const createdBy = params.data?.createdBySession?.createdBy as { name: string } | undefined;
      return createdBy?.name ?? "";
    },
    cellRenderer: (params: ICellRendererParams<SessionGroupRow>) => {
      const createdBy = params.data?.createdBySession?.createdBy as
        | { id: string; name: string; avatarUrl?: string | null }
        | undefined;
      if (!createdBy) return null;
      return (
        <UserProfileChatCard
          userId={createdBy.id}
          fallbackName={createdBy.name}
          fallbackAvatarUrl={createdBy.avatarUrl}
        >
          <div className="flex h-full cursor-pointer items-center gap-1.5">
            {createdBy.avatarUrl && (
              <img
                src={createdBy.avatarUrl}
                alt={createdBy.name}
                className="h-4 w-4 rounded-full"
              />
            )}
            <span className="truncate text-xs text-muted-foreground hover:underline">
              {createdBy.name}
            </span>
          </div>
        </UserProfileChatCard>
      );
    },
  },
  {
    headerName: "Last message",
    colId: "lastActivityAt",
    width: 120,
    filter: true,
    valueGetter: (params) => params.data?._lastMessageAt ?? params.data?.updatedAt,
    cellRenderer: (params: ICellRendererParams<SessionGroupRow>) => {
      const lastMessageAt = (params.value as string | undefined) ?? undefined;
      if (!lastMessageAt) return null;
      return <span className="text-xs text-muted-foreground">{timeAgo(lastMessageAt)}</span>;
    },
    comparator: (a: string | undefined, b: string | undefined) => bucketize(a) - bucketize(b),
  },
];

const { Table, useTable } = createTable<SessionGroupRow>({
  id: "sessions",
  columns,
});

export function SessionsTable({ channelId }: { channelId: string }) {
  const sessionGroups = useEntityStore((s) => s.sessionGroups);
  const sessions = useEntityStore((s) => s.sessions);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
    sessionCount: number;
  } | null>(null);

  const filteredGroups = useMemo(() => {
    return (Object.values(sessionGroups) as SessionGroupEntity[])
      .map((group) => {
        const groupSessions = (Object.values(sessions) as SessionEntity[])
          .filter((session) => session.sessionGroupId === group.id)
          .sort((a, b) => {
            const aSort = a._sortTimestamp ?? a.updatedAt ?? a.createdAt;
            const bSort = b._sortTimestamp ?? b.updatedAt ?? b.createdAt;
            const diff = new Date(bSort).getTime() - new Date(aSort).getTime();
            if (diff !== 0) return diff;
            return a.id.localeCompare(b.id);
          });
        return { group, groupSessions };
      })
      .filter(({ group, groupSessions }) => getSessionGroupChannelId(group, groupSessions) === channelId)
      .map(({ group, groupSessions }) => {
        const latestSession = groupSessions[0];
        const createdBySession = [...groupSessions].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        )[0];
        const sessionStatuses = groupSessions.map((session) => session.status);
        const prUrl = group.prUrl as string | null | undefined;
        const status = getSessionGroupDisplayStatus(sessionStatuses, prUrl);
        const reviewAndActive = isGroupReviewAndActive(sessionStatuses, prUrl);

        return {
          ...group,
          latestSession,
          createdBySession,
          status,
          reviewAndActive,
          _sessionCount: groupSessions.length,
          _lastMessageAt:
            latestSession?._lastMessageAt
            ?? latestSession?._sortTimestamp
            ?? latestSession?.updatedAt
            ?? group.updatedAt,
          _sortTimestamp:
            latestSession?._sortTimestamp
            ?? latestSession?._lastMessageAt
            ?? latestSession?.updatedAt
            ?? group._sortTimestamp
            ?? group.updatedAt,
        } as SessionGroupRow;
      })
      .sort((a, b) => {
        const aSort = a._sortTimestamp ?? a.updatedAt ?? a.createdAt;
        const bSort = b._sortTimestamp ?? b.updatedAt ?? b.createdAt;
        const diff = new Date(bSort).getTime() - new Date(aSort).getTime();
        if (diff !== 0) return diff;
        return a.id.localeCompare(b.id);
      });
  }, [channelId, sessionGroups, sessions]);

  useEffect(() => {
    useTable.getState().setRows(filteredGroups);
  }, [filteredGroups]);

  const getContextMenuItems = useCallback(
    (params: GetContextMenuItemsParams<SessionGroupRow>): (MenuItemDef<SessionGroupRow> | string)[] => {
      if (!params.node?.data) return [];
      const group = params.node.data;
      const sessionId = group.latestSession?.id;
      return [
        {
          name: "Copy Workspace Link",
          action: () => {
            const path = sessionId
              ? `/c/${channelId}/g/${group.id}/s/${sessionId}`
              : `/c/${channelId}/g/${group.id}`;
            navigator.clipboard.writeText(`${window.location.origin}${path}`);
          },
        },
        "separator",
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
    [channelId],
  );

  const filterStorageKey = `${FILTER_STORAGE_KEY_PREFIX}${channelId}`;

  const agGridOptions = useMemo(
    () => ({
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
      onGridReady: (event: GridReadyEvent<SessionGroupRow>) => {
        try {
          const saved = localStorage.getItem(filterStorageKey);
          if (saved) {
            event.api.setFilterModel(JSON.parse(saved));
          }
        } catch {
          // ignore corrupt data
        }
      },
      onFilterChanged: (event: FilterChangedEvent<SessionGroupRow>) => {
        const model = event.api.getFilterModel();
        if (Object.keys(model).length === 0) {
          localStorage.removeItem(filterStorageKey);
        } else {
          localStorage.setItem(filterStorageKey, JSON.stringify(model));
        }
      },
      rowHeight: 40,
      headerHeight: 32,
      suppressCellFocus: true,
      getContextMenuItems,
      getRowHeight: (params: { node: { group?: boolean } }) => {
        if (params.node.group) return 40;
        return undefined;
      },
      groupDisplayType: "groupRows" as const,
      isGroupOpenByDefault: (params: IsGroupOpenByDefaultParams<SessionGroupRow>) => {
        return !collapsedByDefault.has(params.key ?? "");
      },
      groupRowRendererParams: {
        suppressCount: true,
        innerRenderer: (params: ICellRendererParams<SessionGroupRow>) => {
          const status = params.value as string;
          const color = statusColor[status] ?? "text-muted-foreground";
          const label = statusLabel[status] ?? status;
          const count = params.node.allChildrenCount ?? 0;
          const hasReviewAndActive = status === "in_review"
            && params.node.allLeafChildren?.some((child) => child.data?.reviewAndActive);
          return (
            <div className={`flex items-center gap-2 ${color}`}>
              {hasReviewAndActive ? (
                <Loader2 size={12} className="shrink-0 animate-spin" />
              ) : (
                <Circle size={8} className="shrink-0 fill-current" />
              )}
              <span className="text-sm font-semibold">{label}</span>
              <span className="text-xs text-muted-foreground">{count}</span>
            </div>
          );
        },
      },
      initialGroupOrderComparator: (params: {
        nodeA: { key?: string | null };
        nodeB: { key?: string | null };
      }) => {
        const a = statusGroupOrder[params.nodeA.key ?? ""] ?? 99;
        const b = statusGroupOrder[params.nodeB.key ?? ""] ?? 99;
        return a - b;
      },
    }),
    [channelId, filterStorageKey, getContextMenuItems],
  );

  return (
    <>
      <Table className="h-full" agGridOptions={agGridOptions} />
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
