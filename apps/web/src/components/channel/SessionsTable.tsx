import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Circle } from "lucide-react";
import type {
  ColDef,
  GetContextMenuItemsParams,
  ICellRendererParams,
  MenuItemDef,
} from "ag-grid-community";
import { createTable } from "../ui/table";
import { useEntityStore } from "../../stores/entity";
import type { SessionEntity } from "../../stores/entity";
import { useUIStore } from "../../stores/ui";
import { statusColor, statusLabel, getDisplayStatus } from "../session/sessionStatus";
import { timeAgo } from "../../lib/utils";
import { DeleteSessionDialog } from "../session/DeleteSessionDialog";
import { useLongPress } from "../../hooks/useLongPress";
import { UserProfileChatCard } from "../shared/UserProfileChatCard";

type SessionRow = SessionEntity & { id: string };

/** Round a timestamp down to a 2-minute bucket so sort order stays stable
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
    headerName: "Repo",
    field: "repo" as keyof SessionRow,
    width: 140,
    cellRenderer: (params: ICellRendererParams<SessionRow>) => {
      const repo = params.data?.repo as { id: string; name: string } | null | undefined;
      if (!repo) return null;
      return <span className="text-xs text-muted-foreground truncate">{repo.name}</span>;
    },
  },
  {
    headerName: "Created by",
    field: "createdBy",
    width: 150,
    cellRenderer: (params: ICellRendererParams<SessionRow>) => {
      const createdBy = params.data?.createdBy as
        | { id: string; name: string; avatarUrl?: string | null }
        | undefined;
      if (!createdBy) return null;
      return (
        <UserProfileChatCard
          userId={createdBy.id}
          fallbackName={createdBy.name}
          fallbackAvatarUrl={createdBy.avatarUrl}
        >
          <div className="flex items-center gap-1.5 h-full cursor-pointer">
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
    field: "_lastMessageAt",
    width: 120,
    sort: "desc",
    cellRenderer: (params: ICellRendererParams<SessionRow>) => {
      const lastMessageAt = params.data?._lastMessageAt ?? params.data?.updatedAt;
      if (!lastMessageAt) return null;
      return <span className="text-xs text-muted-foreground">{timeAgo(lastMessageAt)}</span>;
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
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const filteredSessions = useMemo(() => {
    return (Object.values(sessions) as SessionRow[])
      .filter((s) => {
        const ch = s.channel as { id: string } | null | undefined;
        return ch?.id === channelId;
      })
      .map((s) => ({
        ...s,
        status: getDisplayStatus(s.status, s.prUrl as string | null | undefined),
      } as SessionRow));
  }, [sessions, channelId]);

  useEffect(() => {
    useTable.getState().setRows(filteredSessions);
  }, [filteredSessions]);

  const setDeleteFromRowId = useCallback(
    (rowId: string) => {
      const session = filteredSessions.find((s) => s.id === rowId);
      if (session) setDeleteTarget({ id: session.id, name: session.name ?? "Untitled" });
    },
    [filteredSessions],
  );

  const longPressFired = useLongPress({ ref: gridRef, onLongPress: setDeleteFromRowId });

  const getContextMenuItems = useCallback(
    (params: GetContextMenuItemsParams<SessionRow>): MenuItemDef<SessionRow>[] => {
      if (!params.node?.data) return [];
      const session = params.node.data;
      return [
        {
          name: "Delete Session",
          action: () => setDeleteTarget({ id: session.id, name: session.name ?? "Untitled" }),
          cssClasses: ["text-destructive"],
        },
      ];
    },
    [],
  );

  const agGridOptions = useMemo(
    () => ({
      onRowClicked: (event: {
        node: { group?: boolean; expanded?: boolean; setExpanded: (v: boolean) => void };
        data?: SessionRow;
      }) => {
        if (longPressFired.current) {
          longPressFired.current = false;
          return;
        }
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
      getContextMenuItems,
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
      initialGroupOrderComparator: (params: {
        nodeA: { key?: string | null };
        nodeB: { key?: string | null };
      }) => {
        const a = statusGroupOrder[params.nodeA.key ?? ""] ?? 99;
        const b = statusGroupOrder[params.nodeB.key ?? ""] ?? 99;
        return a - b;
      },
    }),
    [setActiveSessionId, getContextMenuItems],
  );

  return (
    <>
      <div ref={gridRef}>
        <Table className="h-[calc(100dvh-48px)]" agGridOptions={agGridOptions} />
      </div>
      {deleteTarget && (
        <DeleteSessionDialog
          sessionId={deleteTarget.id}
          sessionName={deleteTarget.name}
          open={true}
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null);
          }}
        />
      )}
    </>
  );
}
