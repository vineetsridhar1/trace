import { Circle, Loader2 } from "lucide-react";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { createTable } from "../ui/table";
import { statusColor } from "../session/sessionStatus";
import { timeAgo } from "../../lib/utils";
import { UserProfileChatCard } from "../shared/UserProfileChatCard";
import type { SessionGroupRow } from "./sessions-table-types";
import { bucketize } from "./sessions-table-types";

type RepoRef = { id: string; name: string };
type CreatedByRef = { id: string; name: string; avatarUrl?: string | null };

function getRepo(data: SessionGroupRow | undefined): RepoRef | null {
  if (!data) return null;
  return (
    (data.repo as RepoRef | null | undefined)
    ?? (data.latestSession?.repo as RepoRef | null | undefined)
    ?? null
  );
}

function getCreatedBy(data: SessionGroupRow | undefined): CreatedByRef | null {
  if (!data) return null;
  return (data.createdBySession?.createdBy as CreatedByRef | undefined) ?? null;
}

function renderStatusIcon(data: SessionGroupRow, size = 12) {
  const color = statusColor[data.status ?? "active"];
  return data.reviewAndActive ? (
    <Loader2 size={size} className={`shrink-0 animate-spin ${color}`} />
  ) : (
    <Circle size={Math.max(size - 4, 7)} className={`shrink-0 fill-current ${color}`} />
  );
}

const statusColumn: ColDef<SessionGroupRow> = {
  headerName: "Status",
  field: "status",
  rowGroup: true,
  hide: true,
};

const repoColumn: ColDef<SessionGroupRow> = {
  headerName: "Repo",
  field: "repo" as keyof SessionGroupRow,
  width: 140,
  filter: true,
  valueGetter: (params) => getRepo(params.data)?.name ?? "",
  cellRenderer: (params: ICellRendererParams<SessionGroupRow>) => {
    const repo = getRepo(params.data);
    if (!repo) return null;
    return <span className="truncate text-xs text-muted-foreground">{repo.name}</span>;
  },
};

const createdByColumn: ColDef<SessionGroupRow> = {
  headerName: "Created by",
  colId: "createdBy",
  width: 150,
  filter: true,
  filterValueGetter: (params) => getCreatedBy(params.data)?.name ?? "",
  cellRenderer: (params: ICellRendererParams<SessionGroupRow>) => {
    const createdBy = getCreatedBy(params.data);
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
};

const lastMessageColumn: ColDef<SessionGroupRow> = {
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
};

export const desktopSessionColumns: ColDef<SessionGroupRow>[] = [
  {
    headerName: "Name",
    field: "name",
    flex: 2,
    minWidth: 200,
    filter: true,
    cellRenderer: (params: ICellRendererParams<SessionGroupRow>) => {
      const { data } = params;
      if (!data) return null;
      return (
        <div className="flex h-full items-center gap-2">
          {renderStatusIcon(data)}
          <span className="truncate text-sm text-foreground">{data.name}</span>
        </div>
      );
    },
  },
  statusColumn,
  repoColumn,
  createdByColumn,
  lastMessageColumn,
];

export const compactSessionColumns: ColDef<SessionGroupRow>[] = [
  {
    headerName: "Workspace",
    field: "name",
    flex: 1,
    minWidth: 220,
    filter: true,
    cellRenderer: (params: ICellRendererParams<SessionGroupRow>) => {
      const { data } = params;
      if (!data) return null;

      const repo = getRepo(data);
      const createdBy = getCreatedBy(data);
      const lastActivityAt = data._lastMessageAt ?? data.updatedAt ?? data.createdAt;

      return (
        <div className="flex h-full min-w-0 flex-col justify-center py-2">
          <div className="flex min-w-0 items-center gap-2">
            {renderStatusIcon(data)}
            <span className="truncate text-sm font-medium text-foreground">{data.name}</span>
          </div>
          <div className="mt-2.5 flex min-w-0 items-center gap-3 text-[11px] text-muted-foreground">
            {repo && (
              <span className="min-w-0 truncate text-[11px] font-medium text-muted-foreground/90">
                {repo.name}
              </span>
            )}
            {createdBy && (
              <span className="min-w-0 truncate">
                {createdBy.name}
              </span>
            )}
            <span className="ml-auto shrink-0">{timeAgo(lastActivityAt)}</span>
          </div>
        </div>
      );
    },
  },
  statusColumn,
  { ...repoColumn, hide: true },
  { ...createdByColumn, hide: true },
  { ...lastMessageColumn, hide: true },
];

export const { Table: SessionsGridTable, useTable: useSessionsGridTable } = createTable<SessionGroupRow>({
  id: "sessions",
  columns: desktopSessionColumns,
});
