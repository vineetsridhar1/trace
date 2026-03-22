import { useEffect, useMemo } from "react";
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
import { navigateToSession } from "../../stores/ui";
import {
  getDisplayStatus,
  isReviewAndActive,
  statusColor,
  statusLabel,
} from "../session/sessionStatus";
import { timeAgo } from "../../lib/utils";
import { UserProfileChatCard } from "../shared/UserProfileChatCard";

type SessionGroupRow = SessionGroupEntity & {
  id: string;
  latestSession?: SessionEntity;
  chatCount: number;
  _displayStatus: string;
  _reviewActive: boolean;
};

const BUCKET_MS = 2 * 60 * 1000;
function bucketize(ts: string | undefined): number {
  if (!ts) return 0;
  const time = new Date(ts).getTime();
  return Math.floor(time / BUCKET_MS) * BUCKET_MS;
}

const collapsedByDefault = new Set(["merged", "failed"]);
const FILTER_STORAGE_KEY_PREFIX = "trace:session-groups-filter:";

const columns: ColDef<SessionGroupRow>[] = [
  {
    headerName: "Name",
    field: "name",
    flex: 2,
    minWidth: 220,
    filter: true,
    cellRenderer: (params: ICellRendererParams<SessionGroupRow>) => {
      const row = params.data;
      if (!row) return null;
      const color = statusColor[row._displayStatus] ?? "text-muted-foreground";
      return (
        <div className="flex h-full items-center gap-2">
          {row._reviewActive ? (
            <Loader2 size={8} className={`shrink-0 animate-spin ${color}`} />
          ) : (
            <Circle size={8} className={`shrink-0 fill-current ${color}`} />
          )}
          <span className="truncate text-sm text-foreground">{row.name}</span>
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {row.chatCount} chats
          </span>
        </div>
      );
    },
  },
  {
    headerName: "Status",
    field: "_displayStatus",
    rowGroup: true,
    hide: true,
  },
  {
    headerName: "Repo",
    colId: "repo",
    width: 150,
    filter: true,
    valueGetter: (params) => {
      const repo = params.data?.latestSession?.repo as { name: string } | null | undefined;
      return repo?.name ?? "";
    },
    cellRenderer: (params: ICellRendererParams<SessionGroupRow>) => {
      const repo = params.data?.latestSession?.repo as { name: string } | null | undefined;
      if (!repo) return null;
      return <span className="truncate text-xs text-muted-foreground">{repo.name}</span>;
    },
  },
  {
    headerName: "Created by",
    colId: "createdBy",
    width: 160,
    filter: true,
    filterValueGetter: (params) => {
      const createdBy = params.data?.latestSession?.createdBy as { name: string } | undefined;
      return createdBy?.name ?? "";
    },
    cellRenderer: (params: ICellRendererParams<SessionGroupRow>) => {
      const createdBy = params.data?.latestSession?.createdBy as
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
    headerName: "Latest Chat",
    colId: "latestChat",
    width: 220,
    filter: true,
    valueGetter: (params) => params.data?.latestSession?.name ?? "",
    cellRenderer: (params: ICellRendererParams<SessionGroupRow>) => {
      const latestSession = params.data?.latestSession;
      if (!latestSession) return null;
      return <span className="truncate text-xs text-muted-foreground">{latestSession.name}</span>;
    },
  },
  {
    headerName: "Last activity",
    colId: "lastActivityAt",
    width: 130,
    filter: true,
    valueGetter: (params) => params.data?._sortTimestamp ?? params.data?.updatedAt,
    cellRenderer: (params: ICellRendererParams<SessionGroupRow>) => {
      const lastActivityAt = (params.value as string | undefined) ?? undefined;
      if (!lastActivityAt) return null;
      return <span className="text-xs text-muted-foreground">{timeAgo(lastActivityAt)}</span>;
    },
    comparator: (a: string | undefined, b: string | undefined) => bucketize(a) - bucketize(b),
  },
];

const { Table, useTable } = createTable<SessionGroupRow>({
  id: "session-groups",
  columns,
});

export function SessionsTable({ channelId }: { channelId: string }) {
  const sessionGroups = useEntityStore((s) => s.sessionGroups);
  const sessions = useEntityStore((s) => s.sessions);

  const rows = useMemo(() => {
    return (Object.values(sessionGroups) as SessionGroupEntity[])
      .filter((group) => {
        const channel = group.channel as { id: string } | null | undefined;
        return channel?.id === channelId;
      })
      .map((group) => {
        const groupSessions = (Object.values(sessions) as SessionEntity[])
          .filter((session) => session.sessionGroupId === group.id)
          .sort((a, b) => {
            const diff = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
            if (diff !== 0) return diff;
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          });
        const latestSession = groupSessions[0];
        const displayStatus = getDisplayStatus(
          latestSession?.status,
          latestSession?.prUrl as string | null | undefined,
        );
        return {
          ...group,
          latestSession,
          chatCount: groupSessions.length,
          _displayStatus: displayStatus,
          _reviewActive: !!latestSession
            && isReviewAndActive(latestSession.status, latestSession.prUrl as string | null | undefined),
          _sortTimestamp: latestSession?._sortTimestamp ?? latestSession?.updatedAt ?? group.updatedAt,
        };
      })
      .sort((a, b) => {
        const diff = new Date(b._sortTimestamp ?? b.updatedAt).getTime()
          - new Date(a._sortTimestamp ?? a.updatedAt).getTime();
        if (diff !== 0) return diff;
        return a.id.localeCompare(b.id);
      }) as SessionGroupRow[];
  }, [channelId, sessionGroups, sessions]);

  useEffect(() => {
    useTable.getState().setRows(rows);
  }, [rows]);

  const filterStorageKey = `${FILTER_STORAGE_KEY_PREFIX}${channelId}`;

  const agGridOptions = useMemo(
    () => ({
      onRowClicked: (event: { node: { group?: boolean; expanded?: boolean; setExpanded: (value: boolean) => void }; data?: SessionGroupRow }) => {
        if (event.node.group) {
          event.node.setExpanded(!event.node.expanded);
          return;
        }
        const sessionId = event.data?.latestSession?.id;
        if (event.data?.id && sessionId) {
          navigateToSession(channelId, event.data.id, sessionId);
        }
      },
      onGridReady: (event: GridReadyEvent<SessionGroupRow>) => {
        const savedFilters = localStorage.getItem(filterStorageKey);
        if (savedFilters) {
          event.api.setFilterModel(JSON.parse(savedFilters));
        }
      },
      onFilterChanged: (event: FilterChangedEvent<SessionGroupRow>) => {
        localStorage.setItem(filterStorageKey, JSON.stringify(event.api.getFilterModel()));
      },
      getContextMenuItems: (params: GetContextMenuItemsParams<SessionGroupRow>): MenuItemDef<SessionGroupRow>[] => {
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
        ];
      },
      autoGroupColumnDef: {
        headerName: "Status",
        minWidth: 200,
        cellRendererParams: {
          suppressCount: false,
        },
        valueFormatter: (params: { value: string }) => statusLabel[params.value] ?? params.value,
      },
      groupDefaultExpanded: 1,
      isGroupOpenByDefault: (params: IsGroupOpenByDefaultParams<SessionGroupRow>) => {
        const key = params.rowNode.key as string;
        return !collapsedByDefault.has(key);
      },
    }),
    [channelId, filterStorageKey],
  );

  return (
    <Table className="h-full" agGridOptions={agGridOptions} />
  );
}
