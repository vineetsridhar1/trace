import { Circle, Loader2 } from "lucide-react";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { createTable } from "../ui/table";
import { agentStatusColor, sessionStatusColor, sessionStatusLabel } from "../session/sessionStatus";
import { AgentStatusIcon } from "../session/AgentStatusIcon";
import { timeAgo } from "../../lib/utils";
import { UserProfileChatCard } from "../shared/UserProfileChatCard";
import type { SessionGroupRow } from "./sessions-table-types";
import { bucketize } from "./sessions-table-types";

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
      const color = agentStatusColor[data.displayAgentStatus ?? "active"];
      return (
        <div className="flex h-full items-center gap-2">
          <AgentStatusIcon
            agentStatus={data.displayAgentStatus}
            size={data.displayAgentStatus === "done" ? 8 : 12}
            className={color}
          />
          <span className="truncate text-sm text-foreground">{data.name}</span>
        </div>
      );
    },
  },
  {
    headerName: "Status",
    field: "displaySessionStatus",
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

export const { Table: SessionsGridTable, useTable: useSessionsGridTable } = createTable<SessionGroupRow>({
  id: "sessions",
  columns,
});
