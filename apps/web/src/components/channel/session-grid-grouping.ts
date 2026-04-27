import { SESSION_COLUMN_IDS } from "./sessions-table-columns";
import type { SessionGridRow, SessionGroupRow, SessionStatusHeaderRow } from "./sessions-table-types";
import { collapsedByDefault, sessionStatusGroupOrder } from "./sessions-table-types";
import {
  getSessionCreatedBy,
  getSessionLastActivityAt,
  getSessionRepo,
} from "./session-cell-data";

type TextFilterCondition = {
  filter?: unknown;
  filterTo?: unknown;
  type?: unknown;
};

type TextFilterModel = TextFilterCondition & {
  conditions?: unknown;
  operator?: unknown;
};

function getRowSortTimestamp(row: SessionGroupRow | undefined): number {
  const timestamp = row?._groupLastMessageAt ?? row?._sortTimestamp ?? row?.updatedAt ?? row?.createdAt;
  return timestamp ? new Date(timestamp).getTime() : 0;
}

function getFilterText(row: SessionGroupRow, columnId: string): string {
  switch (columnId) {
    case SESSION_COLUMN_IDS.compactSummary:
    case SESSION_COLUMN_IDS.name:
      return row.name ?? "";
    case SESSION_COLUMN_IDS.status:
      return row.displaySessionStatus;
    case SESSION_COLUMN_IDS.repo:
      return getSessionRepo(row)?.name ?? "";
    case SESSION_COLUMN_IDS.createdBy:
      return getSessionCreatedBy(row)?.name ?? "";
    case SESSION_COLUMN_IDS.lastActivityAt:
      return getSessionLastActivityAt(row) ?? "";
    default:
      return "";
  }
}

function normalizeFilterValue(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).toLowerCase() : "";
}

function matchesTextCondition(value: string, condition: TextFilterCondition): boolean {
  const filter = normalizeFilterValue(condition.filter);
  const filterTo = normalizeFilterValue(condition.filterTo);
  const normalizedValue = value.toLowerCase();
  const type = typeof condition.type === "string" ? condition.type : "contains";

  switch (type) {
    case "blank":
      return normalizedValue.trim() === "";
    case "notBlank":
      return normalizedValue.trim() !== "";
    case "equals":
      return normalizedValue === filter;
    case "notEqual":
      return normalizedValue !== filter;
    case "startsWith":
      return normalizedValue.startsWith(filter);
    case "endsWith":
      return normalizedValue.endsWith(filter);
    case "notContains":
      return !normalizedValue.includes(filter);
    case "inRange":
      return normalizedValue >= filter && normalizedValue <= filterTo;
    case "contains":
    default:
      return normalizedValue.includes(filter);
  }
}

function isTextFilterCondition(value: unknown): value is TextFilterCondition {
  return typeof value === "object" && value !== null;
}

function matchesFilterEntry(value: string, entry: unknown): boolean {
  if (!isTextFilterCondition(entry)) return true;

  const model = entry as TextFilterModel;
  if (Array.isArray(model.conditions)) {
    const conditions = model.conditions.filter(isTextFilterCondition);
    const operator = typeof model.operator === "string" ? model.operator.toUpperCase() : "AND";
    if (operator === "OR") {
      return conditions.some((condition) => matchesTextCondition(value, condition));
    }
    return conditions.every((condition) => matchesTextCondition(value, condition));
  }

  return matchesTextCondition(value, model);
}

function rowMatchesFilterModel(row: SessionGroupRow, filterModel: Record<string, unknown> | null): boolean {
  if (!filterModel) return true;

  return Object.entries(filterModel).every(([columnId, entry]) => {
    return matchesFilterEntry(getFilterText(row, columnId), entry);
  });
}

function buildHeaderRow({
  expandedStatuses,
  rows,
  status,
}: {
  expandedStatuses: ReadonlySet<string>;
  rows: SessionGroupRow[];
  status: string;
}): SessionStatusHeaderRow {
  const filterTextByColumn = Object.values(SESSION_COLUMN_IDS).reduce<Record<string, string>>(
    (acc, columnId) => {
      acc[columnId] = rows
        .map((row) => getFilterText(row, columnId))
        .filter(Boolean)
        .join(" ");
      return acc;
    },
    {},
  );

  return {
    id: `status:${status}`,
    displaySessionStatus: status,
    _isStatusHeader: true,
    _status: status,
    _count: rows.length,
    _expanded: expandedStatuses.has(status),
    _filterTextByColumn: filterTextByColumn,
  };
}

export function buildSessionGridRows({
  expandedStatuses,
  filterModel,
  rows,
}: {
  expandedStatuses: ReadonlySet<string>;
  filterModel: Record<string, unknown> | null;
  rows: SessionGroupRow[];
}): SessionGridRow[] {
  const groups = new Map<string, SessionGroupRow[]>();

  for (const row of rows) {
    if (!rowMatchesFilterModel(row, filterModel)) continue;
    const statusRows = groups.get(row.displaySessionStatus) ?? [];
    statusRows.push(row);
    groups.set(row.displaySessionStatus, statusRows);
  }

  return [...groups.entries()]
    .sort(([statusA, rowsA], [statusB, rowsB]) => {
      const statusDiff = (sessionStatusGroupOrder[statusA] ?? 99) - (sessionStatusGroupOrder[statusB] ?? 99);
      if (statusDiff !== 0) return statusDiff;
      return Math.max(...rowsB.map(getRowSortTimestamp), 0) - Math.max(...rowsA.map(getRowSortTimestamp), 0);
    })
    .flatMap(([status, statusRows]) => {
      const sortedRows = [...statusRows].sort((a, b) => {
        const diff = getRowSortTimestamp(b) - getRowSortTimestamp(a);
        if (diff !== 0) return diff;
        return a.id.localeCompare(b.id);
      });
      const header = buildHeaderRow({ expandedStatuses, rows: sortedRows, status });
      return header._expanded ? [header, ...sortedRows] : [header];
    });
}

export function getDefaultExpandedStatuses(rows: SessionGroupRow[]): Set<string> {
  return new Set(
    rows
      .map((row) => row.displaySessionStatus)
      .filter((status) => !collapsedByDefault.has(status)),
  );
}
