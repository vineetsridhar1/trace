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
    headerName: "Updated",
    field: "updatedAt",
    width: 120,
    sort: "desc",
    cellRenderer: (params: ICellRendererParams<SessionRow>) => {
      const updatedAt = params.data?.updatedAt;
      if (!updatedAt) return null;
      return (
        <span className="text-xs text-muted-foreground">
          {timeAgo(updatedAt)}
        </span>
      );
    },
    comparator: (a: string, b: string) => {
      return new Date(a).getTime() - new Date(b).getTime();
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

  return (
    <Table
      className="h-[calc(100vh-48px)]"
      agGridOptions={{
        onRowClicked: (event) => {
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
        getRowHeight: (params) => {
          if (params.node.group) return 40;
          return undefined;
        },
        groupDisplayType: "groupRows",
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
        initialGroupOrderComparator: (params) => {
          const a = statusGroupOrder[params.nodeA.key ?? ""] ?? 99;
          const b = statusGroupOrder[params.nodeB.key ?? ""] ?? 99;
          return a - b;
        },
      }}
    />
  );
}
