import type { ColDef, ColumnState, GridApi, ICellRendererParams } from "ag-grid-community";
import { SessionCompactSummaryCell } from "./SessionCompactSummaryCell";
import { SessionCreatedByCell } from "./SessionCreatedByCell";
import { SessionLastActivityCell } from "./SessionLastActivityCell";
import { SessionNameCell } from "./SessionNameCell";
import { SessionRepoCell } from "./SessionRepoCell";
import type { SessionGroupRow } from "./sessions-table-types";
import { bucketize } from "./sessions-table-types";
import {
  getSessionCreatedBy,
  getSessionLastActivityAt,
  getSessionRepo,
} from "./session-cell-data";

export const SESSION_COLUMN_IDS = {
  compactSummary: "compactSummary",
  name: "name",
  status: "status",
  repo: "repo",
  createdBy: "createdBy",
  lastActivityAt: "lastActivityAt",
} as const;

const statusColumn: ColDef<SessionGroupRow> = {
  colId: SESSION_COLUMN_IDS.status,
  headerName: "Status",
  field: "displaySessionStatus",
  rowGroup: true,
  hide: true,
};

const repoColumn: ColDef<SessionGroupRow> = {
  colId: SESSION_COLUMN_IDS.repo,
  headerName: "Repo",
  field: "repo" as keyof SessionGroupRow,
  width: 140,
  filter: true,
  valueGetter: (params) => getSessionRepo(params.data)?.name ?? "",
  cellRenderer: (params: ICellRendererParams<SessionGroupRow>) => (
    <SessionRepoCell row={params.data} />
  ),
};

const createdByColumn: ColDef<SessionGroupRow> = {
  headerName: "Created by",
  colId: SESSION_COLUMN_IDS.createdBy,
  width: 150,
  filter: true,
  filterValueGetter: (params) => getSessionCreatedBy(params.data)?.name ?? "",
  cellRenderer: (params: ICellRendererParams<SessionGroupRow>) => (
    <SessionCreatedByCell row={params.data} />
  ),
};

const lastMessageColumn: ColDef<SessionGroupRow> = {
  headerName: "Last message",
  colId: SESSION_COLUMN_IDS.lastActivityAt,
  width: 120,
  filter: true,
  valueGetter: (params) => getSessionLastActivityAt(params.data),
  cellRenderer: (params: ICellRendererParams<SessionGroupRow>) => (
    <SessionLastActivityCell value={(params.value as string | undefined) ?? undefined} />
  ),
  comparator: (a: string | undefined, b: string | undefined) => bucketize(a) - bucketize(b),
};

export const sessionColumns: ColDef<SessionGroupRow>[] = [
  {
    colId: SESSION_COLUMN_IDS.compactSummary,
    headerName: "Workspace",
    field: "name",
    flex: 1,
    minWidth: 220,
    hide: true,
    cellRenderer: (params: ICellRendererParams<SessionGroupRow>) => (
      <SessionCompactSummaryCell row={params.data} />
    ),
  },
  {
    colId: SESSION_COLUMN_IDS.name,
    headerName: "Name",
    field: "name",
    flex: 2,
    minWidth: 200,
    filter: true,
    cellRenderer: (params: ICellRendererParams<SessionGroupRow>) => (
      <SessionNameCell row={params.data} />
    ),
  },
  statusColumn,
  repoColumn,
  createdByColumn,
  lastMessageColumn,
];

export function getSessionsColumnState(isCompact: boolean): ColumnState[] {
  if (isCompact) {
    return [
      { colId: SESSION_COLUMN_IDS.compactSummary, hide: false },
      { colId: SESSION_COLUMN_IDS.name, hide: true },
      { colId: SESSION_COLUMN_IDS.status, hide: true },
      { colId: SESSION_COLUMN_IDS.repo, hide: true },
      { colId: SESSION_COLUMN_IDS.createdBy, hide: true },
      { colId: SESSION_COLUMN_IDS.lastActivityAt, hide: true },
    ];
  }

  return [
    { colId: SESSION_COLUMN_IDS.compactSummary, hide: true },
    { colId: SESSION_COLUMN_IDS.name, hide: false },
    { colId: SESSION_COLUMN_IDS.status, hide: true },
    { colId: SESSION_COLUMN_IDS.repo, hide: false },
    { colId: SESSION_COLUMN_IDS.createdBy, hide: false },
    { colId: SESSION_COLUMN_IDS.lastActivityAt, hide: false },
  ];
}

// Keep one stable AG Grid column set and switch visibility explicitly. Swapping
// column definitions caused AG Grid to retain the compact visibility state when
// returning to desktop mode.
export function applySessionsColumnMode(api: GridApi<SessionGroupRow>, isCompact: boolean) {
  api.applyColumnState({
    state: getSessionsColumnState(isCompact),
    applyOrder: true,
  });
}
