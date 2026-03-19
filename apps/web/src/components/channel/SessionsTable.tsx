import { useEffect, useMemo } from "react";
import { Circle, GitPullRequest } from "lucide-react";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { createTable } from "../ui/table";
import { useEntityStore } from "../../stores/entity";
import type { SessionEntity } from "../../stores/entity";
import { useUIStore } from "../../stores/ui";
import { statusColor, statusLabel } from "../session/sessionStatus";
import { timeAgo } from "../../lib/utils";

type SessionRow = SessionEntity & { id: string };

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
    width: 130,
    cellRenderer: (params: ICellRendererParams<SessionRow>) => {
      const { data } = params;
      if (!data) return null;
      const color = statusColor[data.status ?? "active"];
      const label = statusLabel[data.status ?? "active"];
      return (
        <div className={`flex items-center gap-1.5 h-full text-xs ${color}`}>
          {data.prUrl && (
            <a
              href={data.prUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="hover:opacity-70"
            >
              <GitPullRequest size={12} />
            </a>
          )}
          <span>{label}</span>
        </div>
      );
    },
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
      className="h-[calc(100vh-6rem)]"
      agGridOptions={{
        onRowClicked: (event) => {
          if (event.data?.id) {
            setActiveSessionId(event.data.id);
          }
        },
        rowHeight: 40,
        headerHeight: 32,
        suppressCellFocus: true,
      }}
    />
  );
}
