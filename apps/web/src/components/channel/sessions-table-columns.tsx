import type {
  ColDef,
  ColumnState,
  GridApi,
  ICellRendererParams,
  ValueGetterParams,
} from "ag-grid-community";
import { SessionCompactSummaryCell } from "./SessionCompactSummaryCell";
import { SessionCreatedByCell } from "./SessionCreatedByCell";
import { SessionLastActivityCell } from "./SessionLastActivityCell";
import { SessionNameCell } from "./SessionNameCell";
import { SessionRepoCell } from "./SessionRepoCell";
import type { SessionGridRow, SessionGroupRow } from "./sessions-table-types";
import { bucketize, isSessionStatusHeaderRow } from "./sessions-table-types";
import { getSessionCreatedBy, getSessionLastActivityAt, getSessionRepo } from "./session-cell-data";

export const SESSION_COLUMN_IDS = {
  compactSummary: "compactSummary",
  name: "name",
  status: "status",
  repo: "repo",
  createdBy: "createdBy",
  lastActivityAt: "lastActivityAt",
} as const;

function headerFilterText(row: SessionGridRow | undefined, columnId: string): string | undefined {
  return isSessionStatusHeaderRow(row) ? row._filterTextByColumn[columnId] : undefined;
}

function rowName(row: SessionGridRow | undefined): string {
  return row && !isSessionStatusHeaderRow(row) ? row.name : "";
}

const statusColumn: ColDef<SessionGridRow> = {
  colId: SESSION_COLUMN_IDS.status,
  headerName: "Status",
  field: "displaySessionStatus",
  hide: true,
  filterValueGetter: (params: ValueGetterParams<SessionGridRow>) =>
    headerFilterText(params.data, SESSION_COLUMN_IDS.status) ??
    params.data?.displaySessionStatus ??
    "",
};

const repoColumn: ColDef<SessionGridRow> = {
  colId: SESSION_COLUMN_IDS.repo,
  headerName: "Repo",
  width: 140,
  filter: true,
  valueGetter: (params: ValueGetterParams<SessionGridRow>) =>
    headerFilterText(params.data, SESSION_COLUMN_IDS.repo) ??
    getSessionRepo(params.data as SessionGroupRow | undefined)?.name ??
    "",
  cellRenderer: (params: ICellRendererParams<SessionGridRow>) => (
    <SessionRepoCell row={params.data as SessionGroupRow | undefined} />
  ),
};

const createdByColumn: ColDef<SessionGridRow> = {
  headerName: "Created by",
  colId: SESSION_COLUMN_IDS.createdBy,
  width: 150,
  filter: true,
  filterValueGetter: (params: ValueGetterParams<SessionGridRow>) =>
    headerFilterText(params.data, SESSION_COLUMN_IDS.createdBy) ??
    getSessionCreatedBy(params.data as SessionGroupRow | undefined)?.name ??
    "",
  cellRenderer: (params: ICellRendererParams<SessionGridRow>) => (
    <SessionCreatedByCell row={params.data as SessionGroupRow | undefined} />
  ),
};

const lastMessageColumn: ColDef<SessionGridRow> = {
  headerName: "Last message",
  colId: SESSION_COLUMN_IDS.lastActivityAt,
  width: 120,
  filter: true,
  valueGetter: (params: ValueGetterParams<SessionGridRow>) =>
    headerFilterText(params.data, SESSION_COLUMN_IDS.lastActivityAt) ??
    getSessionLastActivityAt(params.data as SessionGroupRow | undefined),
  cellRenderer: (params: ICellRendererParams<SessionGridRow>) => (
    <SessionLastActivityCell value={(params.value as string | undefined) ?? undefined} />
  ),
  comparator: (a: string | undefined, b: string | undefined) => bucketize(a) - bucketize(b),
};

export const sessionColumns: ColDef<SessionGridRow>[] = [
  {
    colId: SESSION_COLUMN_IDS.compactSummary,
    headerName: "Workspace",
    field: "name",
    flex: 1,
    minWidth: 220,
    hide: true,
    filterValueGetter: (params: ValueGetterParams<SessionGridRow>) =>
      headerFilterText(params.data, SESSION_COLUMN_IDS.compactSummary) ?? rowName(params.data),
    cellRenderer: (params: ICellRendererParams<SessionGridRow>) => (
      <SessionCompactSummaryCell row={params.data as SessionGroupRow | undefined} />
    ),
  },
  {
    colId: SESSION_COLUMN_IDS.name,
    headerName: "Name",
    field: "name",
    flex: 2,
    minWidth: 200,
    filter: true,
    filterValueGetter: (params: ValueGetterParams<SessionGridRow>) =>
      headerFilterText(params.data, SESSION_COLUMN_IDS.name) ?? rowName(params.data),
    cellRenderer: (params: ICellRendererParams<SessionGridRow>) => (
      <SessionNameCell row={params.data as SessionGroupRow | undefined} />
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
export function applySessionsColumnMode(api: GridApi<SessionGridRow>, isCompact: boolean) {
  api.applyColumnState({
    state: getSessionsColumnState(isCompact),
    applyOrder: true,
  });
}
