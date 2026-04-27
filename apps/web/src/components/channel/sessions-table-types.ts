import type { SessionEntity, SessionGroupEntity } from "@trace/client-core";

export type SessionGroupRow = SessionGroupEntity & {
  id: string;
  displaySessionStatus: string;
  displayAgentStatus: string;
  latestSession?: SessionEntity;
  createdBySession?: SessionEntity;
  _groupLastMessageAt?: string;
  _sortTimestamp?: string;
  _sessionCount: number;
};

export type SessionStatusHeaderRow = {
  id: string;
  displaySessionStatus: string;
  _isStatusHeader: true;
  _status: string;
  _count: number;
  _expanded: boolean;
  _filterTextByColumn: Record<string, string>;
};

export type SessionGridRow = SessionGroupRow | SessionStatusHeaderRow;

export function isSessionStatusHeaderRow(
  row: SessionGridRow | undefined,
): row is SessionStatusHeaderRow {
  return Boolean(row && "_isStatusHeader" in row && row._isStatusHeader === true);
}

export const COMPACT_BREAKPOINT = 600;
export const FILTER_STORAGE_KEY_PREFIX = "trace:sessions-filter:";

const BUCKET_MS = 2 * 60 * 1000;
export function bucketize(ts: string | undefined): number {
  if (!ts) return 0;
  const t = new Date(ts).getTime();
  return Math.floor(t / BUCKET_MS) * BUCKET_MS;
}

export const collapsedByDefault = new Set(["failed", "stopped"]);

export const sessionStatusGroupOrder: Record<string, number> = {
  needs_input: 0,
  in_review: 1,
  in_progress: 2,
  failed: 3,
  stopped: 4,
  merged: 5,
  archived: 6,
};
