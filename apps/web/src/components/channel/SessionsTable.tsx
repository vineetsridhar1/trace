import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { navigateToSessionGroup, useUIStore } from "../../stores/ui";
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
import { AnimatePresence, motion } from "framer-motion";

const COMPACT_BREAKPOINT = 600;

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

function MobileSessionsList({
  channelId,
  rows,
}: {
  channelId: string;
  rows: SessionGroupRow[];
}) {
  const activeSessionGroupId = useUIStore((s) => s.activeSessionGroupId);

  const grouped = useMemo(() => {
    const groups: Record<string, SessionGroupRow[]> = {};
    for (const row of rows) {
      const status = row.status ?? "active";
      if (!groups[status]) groups[status] = [];
      groups[status].push(row);
    }
    return Object.entries(groups).sort(
      ([a], [b]) => (statusGroupOrder[a] ?? 99) - (statusGroupOrder[b] ?? 99),
    );
  }, [rows]);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {grouped.map(([status, items]) => {
        const color = statusColor[status] ?? "text-muted-foreground";
        const label = statusLabel[status] ?? status;
        const hasReviewAndActive =
          status === "in_review" && items.some((item) => item.reviewAndActive);
        return (
          <div key={status}>
            <div className={`flex items-center gap-2 px-3 py-2 ${color}`}>
              {hasReviewAndActive ? (
                <Loader2 size={12} className="shrink-0 animate-spin" />
              ) : (
                <Circle size={8} className="shrink-0 fill-current" />
              )}
              <span className="text-xs font-semibold">{label}</span>
              <span className="text-xs text-muted-foreground">
                {items.length}
              </span>
            </div>
            {!collapsedByDefault.has(status) &&
              items.map((row) => {
                const rowColor = statusColor[row.status ?? "active"];
                const isActive = row.id === activeSessionGroupId;
                return (
                  <button
                    key={row.id}
                    type="button"
                    className={`flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-muted/50 active:bg-muted ${isActive ? "bg-muted" : ""}`}
                    onClick={() => {
                      const latestSessionId = row.latestSession?.id ?? null;
                      navigateToSessionGroup(channelId, row.id, latestSessionId);
                    }}
                  >
                    {row.reviewAndActive ? (
                      <Loader2
                        size={10}
                        className={`shrink-0 animate-spin ${rowColor}`}
                      />
                    ) : (
                      <Circle
                        size={7}
                        className={`shrink-0 fill-current ${rowColor}`}
                      />
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                      {row.name}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {timeAgo(
                        row._lastMessageAt ?? row.updatedAt ?? row.createdAt,
                      )}
                    </span>
                  </button>
                );
              })}
          </div>
        );
      })}
    </div>
  );
}

export function SessionsTable({ channelId }: { channelId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isCompact, setIsCompact] = useState(false);
  const sessionGroups = useEntityStore((s) => s.sessionGroups);
  const sessions = useEntityStore((s) => s.sessions);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
    sessionCount: number;
  } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setIsCompact(entry.contentRect.width < COMPACT_BREAKPOINT);
      }
    });
    observer.observe(el);
    setIsCompact(el.getBoundingClientRect().width < COMPACT_BREAKPOINT);
    return () => observer.disconnect();
  }, []);

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
    <div ref={containerRef} className="relative h-full overflow-hidden">
      <AnimatePresence mode="wait">
        {isCompact ? (
          <motion.div
            key="compact"
            className="h-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
          >
            <MobileSessionsList channelId={channelId} rows={filteredGroups} />
          </motion.div>
        ) : (
          <motion.div
            key="table"
            className="h-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
          >
            <Table className="h-full" agGridOptions={agGridOptions} />
          </motion.div>
        )}
      </AnimatePresence>
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
    </div>
  );
}
