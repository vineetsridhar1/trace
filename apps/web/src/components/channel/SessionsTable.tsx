import { useEffect, useMemo } from "react";
import { Circle } from "lucide-react";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { createTable } from "../ui/table";
import { useEntityStore } from "../../stores/entity";
import type { SessionEntity } from "../../stores/entity";
import { useUIStore } from "../../stores/ui";
import { statusColor, statusLabel } from "../session/sessionStatus";
import { timeAgo } from "../../lib/utils";

type SessionRow = SessionEntity & { id: string };

/** Round a timestamp down to a 5-minute bucket so sort order stays stable
 *  while messages stream in — rows only reorder when they cross a boundary. */
const BUCKET_MS = 2 * 60 * 1000;
function bucketize(ts: string | undefined): number {
  if (!ts) return 0;
  const t = new Date(ts).getTime();
  return Math.floor(t / BUCKET_MS) * BUCKET_MS;
}

/** Group ordering — attention-needed first, then active, then done. */
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

const columns: ColDef<SessionRow>[] = [
  {
    headerName: "Name",
    field: "name",
    flex: 2,
    minWidth: 200,
    cellRenderer: (params: ICellRendererParams<SessionRow>) => {
      const { data } = params;
      if (!data) return null;
      const color = statusColor[data.status ?? "active"];
      return (
        <div className="flex items-center gap-2 h-full">
          <Circle size={8} className={`shrink-0 fill-current ${color}`} />
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
    headerName: "Created by",
    field: "createdBy",
    width: 150,
    cellRenderer: (params: ICellRendererParams<SessionRow>) => {
      const createdBy = params.data?.createdBy;
      if (!createdBy) return null;
      return (
        <div className="flex items-center gap-1.5 h-full">
          {createdBy.avatarUrl && (
            <img
              src={createdBy.avatarUrl}
              alt={createdBy.name}
              className="h-4 w-4 rounded-full"
            />
          )}
          <span className="truncate text-xs text-muted-foreground">
            {createdBy.name}
          </span>
        </div>
      );
    },
  },
  {
    headerName: "Last message",
    field: "_lastMessageAt",
    width: 120,
    sort: "desc",
    cellRenderer: (params: ICellRendererParams<SessionRow>) => {
      const lastMessageAt = params.data?._lastMessageAt ?? params.data?.updatedAt;
      if (!lastMessageAt) return null;
      return (
        <span className="text-xs text-muted-foreground">
          {timeAgo(lastMessageAt)}
        </span>
      );
    },
    comparator: (a: string | undefined, b: string | undefined) => {
      return bucketize(a) - bucketize(b);
    },
  },
];

const { Table, useTable } = createTable<SessionRow>({
  id: "sessions",
  columns,
});

export function SessionsTable({ channelId }: { channelId: string }) {
  const sessions = useEntityStore((s) => s.sessions);
  const setActiveSessionId = useUIStore((s) => s.setActiveSessionId);

  const filteredSessions = useMemo(() => {
    return Object.values(sessions).filter((s) => {
      const ch = s.channel as { id: string } | null | undefined;
      return ch?.id === channelId;
    }) as SessionRow[];
  }, [sessions, channelId]);

  useEffect(() => {
    useTable.getState().setRows(filteredSessions);
  }, [filteredSessions]);

  const agGridOptions = useMemo(
    () => ({
      onRowClicked: (event: { node: { group?: boolean; expanded?: boolean; setExpanded: (v: boolean) => void }; data?: SessionRow }) => {
        if (event.node.group) {
          event.node.setExpanded(!event.node.expanded);
          return;
        }
        if (event.data?.id) {
          setActiveSessionId(event.data.id);
        }
      },
      rowHeight: 40,
      headerHeight: 32,
      suppressCellFocus: true,
      getRowHeight: (params: { node: { group?: boolean } }) => {
        if (params.node.group) return 40;
        return undefined;
      },
      groupDisplayType: "groupRows" as const,
      groupDefaultExpanded: -1,
      groupRowRendererParams: {
        suppressCount: true,
        innerRenderer: (params: ICellRendererParams) => {
          const status = params.value as string;
          const color = statusColor[status] ?? "text-muted-foreground";
          const label = statusLabel[status] ?? status;
          const count = params.node.allChildrenCount ?? 0;
          return (
            <div className={`flex items-center gap-2 ${color}`}>
              <Circle size={8} className="shrink-0 fill-current" />
              <span className="text-sm font-semibold">{label}</span>
              <span className="text-xs text-muted-foreground">{count}</span>
            </div>
          );
        },
      },
      initialGroupOrderComparator: (params: { nodeA: { key?: string | null }; nodeB: { key?: string | null } }) => {
        const a = statusGroupOrder[params.nodeA.key ?? ""] ?? 99;
        const b = statusGroupOrder[params.nodeB.key ?? ""] ?? 99;
        return a - b;
      },
    }),
    [setActiveSessionId],
  );

  return (
    <Table
      // 48px = h-12 channel bar above
      className="h-[calc(100vh-48px)]"
      agGridOptions={agGridOptions}
    />
  );
}
